/**
 * 4.1 — HMR invalidation: semantics of planInvalidation (pure), the
 * registry's Windows rules and the hand-off to Vite's module graph
 * (tsazorHotUpdate) with a stub dev server.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CodegenResult } from "@tsazor/compiler";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeFileKey, planInvalidation, TransformRegistry, type WatchEventContext } from "../src/invalidate";
import { tsazorHotUpdate, type TsazorHotUpdateOptions } from "../src/hot-update";
import { transformTsazor } from "../src/transform";

type Metadata = CodegenResult["metadata"];

/** Metadata object with the compiler's required fields. */
function metadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    routeTemplates: [],
    usings: [],
    imports: [],
    injects: [],
    typeParams: [],
    unresolvedTags: [],
    ...overrides,
  };
}

function context(
  file: string,
  event: WatchEventContext["event"],
  registry: TransformRegistry,
  metadata?: Metadata,
  overrides: Partial<WatchEventContext> = {},
): WatchEventContext {
  return { file, event, metadata, registry, listTsazorUnder: async () => [], dependentsOf: () => [], ...overrides };
}

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-hmr-"));
  await mkdir(path.join(root, "Pages"), { recursive: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("planInvalidation: semantics", () => {
  it("create: a new component re-transforms files with a previously unresolved tag", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(page, metadata({ unresolvedTags: ["HmrBadge"] }), []);
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "HmrBadge.tsazor"), "create", registry, metadata()),
    );
    expect(plan.retransform.map((file) => path.basename(file).toLowerCase())).toEqual(["home.tsazor"]);
    expect(plan.routesModule).toBe(false);
  });

  it("create: a new @page page updates the route manifest", async () => {
    const registry = new TransformRegistry();
    const plan = await planInvalidation(
      context(path.join(root, "Pages", "Imprint.tsazor"), "create", registry, metadata({ routeTemplates: ["/imprint"] })),
    );
    expect(plan.routesModule).toBe(true);
  });

  it("create: a new layout that a page names as @layout updates the route manifest", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(page, metadata({ layout: "FancyLayout" }), []);
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "FancyLayout.tsazor"), "create", registry, metadata()),
    );
    expect(plan.routesModule).toBe(true);
  });

  it("create: a new component unrelated to routes leaves the route manifest untouched", async () => {
    const registry = new TransformRegistry();
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "Badge.tsazor"), "create", registry, metadata()),
    );
    expect(plan.routesModule).toBe(false);
    expect(plan.retransform).toEqual([]);
  });

  it("update: an added `@page` re-transforms only consumers and the manifest", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(page, metadata({ unresolvedTags: [] }), [path.join(root, "Shared", "Badge.tsazor")]);
    const plan = await planInvalidation(
      context(
        path.join(root, "Shared", "Badge.tsazor"),
        "update",
        registry,
        metadata({ routeTemplates: ["/badge"] }),
      ),
    );
    expect(plan.retransform).toEqual([page]);
    expect(plan.routesModule).toBe(true);
  });

  it("update: a markup-only change does not alter the route manifest", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(page, metadata(), [path.join(root, "Shared", "Badge.tsazor")]);
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "Badge.tsazor"), "update", registry, metadata()),
    );
    expect(plan.routesModule).toBe(false);
    expect(plan.retransform).toEqual([page]);
  });

  it("delete: a removed @page page updates the route manifest and drops the registry entry", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Imprint.tsazor");
    registry.recordTransform(page, metadata({ routeTemplates: ["/imprint"] }), []);
    const plan = await planInvalidation(context(page, "delete", registry, undefined));
    expect(plan.routesModule).toBe(true);
    expect(registry.get(page)).toBeUndefined();
  });

  it("_Imports.tsazor: a change re-transforms all files below it (via scanner)", async () => {
    const registry = new TransformRegistry();
    const importsFile = path.join(root, "_Imports.tsazor");
    const home = path.join(root, "Pages", "Home.tsazor");
    const shared = path.join(root, "Shared", "Badge.tsazor");
    registry.recordTransform(home, metadata(), []);
    registry.recordDynamic(importsFile, metadata(), true);
    const plan = await planInvalidation(
      context(importsFile, "update", registry, metadata({ usings: ["./Shared"] }), {
        listTsazorUnder: async (dir) => (dir === root ? [home, shared] : []),
      }),
    );
    const touched = plan.retransform.map((file) => normalizeFileKey(file)).sort();
    expect(touched).toEqual([normalizeFileKey(home), normalizeFileKey(shared)].sort());
    expect(plan.routesModule).toBe(false);
  });

  it("_Imports.tsazor: a changed @layout updates the route manifest", async () => {
    const registry = new TransformRegistry();
    const importsFile = path.join(root, "_Imports.tsazor");
    registry.recordDynamic(importsFile, metadata({ layout: "MainLayout" }), true);
    const plan = await planInvalidation(
      context(importsFile, "update", registry, metadata({ layout: "FancyLayout" }), {
        listTsazorUnder: async () => [],
      }),
    );
    expect(plan.routesModule).toBe(true);
    expect(registry.get(importsFile)?.layoutName).toBe("FancyLayout");
  });

  it("_Imports.tsazor: a changed @authorize or @allowAnonymous updates the route manifest (B12)", async () => {
    const registry = new TransformRegistry();
    const importsFile = path.join(root, "_Imports.tsazor");
    const update = (next: Metadata) => planInvalidation(context(importsFile, "update", registry, next, { listTsazorUnder: async () => [] }));
    registry.recordDynamic(importsFile, metadata({ layout: "MainLayout" }), true);
    expect((await update(metadata({ layout: "MainLayout", authorize: true }))).routesModule).toBe(true);
    expect((await update(metadata({ layout: "MainLayout", authorize: true, authorizeData: { policy: "Staff" } }))).routesModule).toBe(true);
    expect((await update(metadata({ layout: "MainLayout", authorize: true, authorizeData: { policy: "Staff" } }))).routesModule).toBe(false);
    expect((await update(metadata({ layout: "MainLayout", allowAnonymous: true }))).routesModule).toBe(true);
  });

  it("_Imports.tsazor without a previous entry (startup) does not update the manifest", async () => {
    const registry = new TransformRegistry();
    const importsFile = path.join(root, "_Imports.tsazor");
    const plan = await planInvalidation(
      context(importsFile, "update", registry, metadata({ layout: "MainLayout" }), {
        listTsazorUnder: async () => [],
      }),
    );
    expect(plan.routesModule).toBe(false);
  });

  it("code-behind (.tsazor.ts): owner and tag consumers are re-transformed", async () => {
    const registry = new TransformRegistry();
    const owner = path.join(root, "Shared", "Badge.tsazor");
    const consumer = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(consumer, metadata(), [owner]);
    const plan = await planInvalidation(context(`${owner}.ts`, "update", registry, undefined));
    const touched = plan.retransform.map((file) => normalizeFileKey(file)).sort();
    expect(touched).toEqual([normalizeFileKey(owner), normalizeFileKey(consumer)].sort());
  });

  it("CSS sidecar: Vite handles changes itself; adding one re-transforms the owner", async () => {
    const registry = new TransformRegistry();
    const owner = path.join(root, "Shared", "Badge.tsazor");
    const update = await planInvalidation(context(`${owner}.css`, "update", registry, undefined));
    expect(update).toEqual({ retransform: [], routesModule: false, fullReload: false });

    const create = await planInvalidation(context(`${owner}.css`, "create", registry, undefined));
    expect(create.retransform).toEqual([owner]);
    expect(create.fullReload).toBe(false);
  });

  it("CSS sidecar: removal forces a full reload (injected <style> tags do not survive HMR)", async () => {
    const registry = new TransformRegistry();
    const plan = await planInvalidation(
      context(`${path.join(root, "Shared", "Badge.tsazor")}.css`, "delete", registry, undefined),
    );
    expect(plan.fullReload).toBe(true);
    expect(plan.retransform).toEqual([path.join(root, "Shared", "Badge.tsazor")]);
  });

  it("any .ts (base chain): reverse edges from the 2.1 cache are used", async () => {
    const registry = new TransformRegistry();
    const dependent = path.join(root, "Shared", "Derived.tsazor");
    registry.recordTransform(dependent, metadata(), []);
    const plan = await planInvalidation(
      context(path.join(root, "base.ts"), "update", registry, undefined, {
        dependentsOf: (file) => (file.endsWith("base.ts") ? [dependent] : []),
      }),
    );
    expect(plan.retransform).toEqual([dependent]);
  });

  it("removed component: consumers are re-transformed, manifest only when routes/layouts are involved", async () => {
    const registry = new TransformRegistry();
    const badge = path.join(root, "Shared", "Badge.tsazor");
    const consumer = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(consumer, metadata(), [badge]);

    const plan = await planInvalidation(context(badge, "delete", registry, undefined));
    expect(plan.retransform).toEqual([consumer]);
    expect(plan.routesModule).toBe(false);
  });
});

describe("TransformRegistry: Windows paths case-insensitive", () => {
  it("finds entries regardless of spelling (backslashes vs. POSIX, upper/lower case)", () => {
    const registry = new TransformRegistry();
    const recorded = "D:\\Own\\Tsazor\\App\\Pages\\Home.tsazor";
    registry.recordTransform(recorded, metadata({ unresolvedTags: ["HmrBadge"] }), ["D:/Own/Tsazor/App/Shared/Badge.tsazor"]);

    expect(registry.get("d:/own/tsazor/app/PAGES/Home.tsazor")).toBeDefined();
    expect(registry.consumersOf("d:\\own\\tsazor\\app\\shared\\badge.tsazor")).toEqual([recorded]);
    expect(registry.filesWithUnresolvedTag("hmrbadge")).toEqual([recorded]);
    expect(registry.hasLayoutNameOf("mainlayout")).toBe(false);
    registry.recordDynamic(recorded, metadata({ layout: "FancyLayout" }), false);
    expect(registry.hasLayoutNameOf("fancylayout")).toBe(true);
  });

  it("deduplicates the self entry: the changed file itself is not in the plan", async () => {
    const registry = new TransformRegistry();
    const file = path.join(root, "Pages", "Self.tsazor");
    registry.recordTransform(file, metadata(), []);
    const plan = await planInvalidation(
      context(file, "update", registry, undefined, { dependentsOf: () => [file] }),
    );
    expect(plan.retransform).toEqual([]);
  });
});

describe("tsazorHotUpdate: hand-off to the module graph", () => {
  /** Stub dev server: module graph by URL/ID, HMR channel records payloads. */
  function fakeServer(projectRoot: string, hotPayloads: unknown[] = []): ViteDevServer {
    return {
      config: { root: projectRoot },
      moduleGraph: {
        getModuleByUrl: (url: string) => Promise.resolve({ file: null, id: url }),
        getModuleById: (id: string) => ({ file: null, id }),
      },
      hot: { send: (payload: unknown) => hotPayloads.push(payload) },
    } as unknown as ViteDevServer;
  }

  let app: string;

  beforeAll(async () => {
    app = await mkdtemp(path.join(tmpdir(), "tsazor-hmr-live-"));
    await mkdir(path.join(app, "Pages"), { recursive: true });
    await mkdir(path.join(app, "Shared"), { recursive: true });
    await writeFile(path.join(app, "_Imports.tsazor"), "@using ./Shared\n");
    await writeFile(path.join(app, "Shared", "Greeter.tsazor"), "<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n}\n");
    await writeFile(path.join(app, "Pages", "Home.tsazor"), "@page \"/\"\n<Greeter Name=\"World\" />\n");
  });

  afterAll(async () => {
    await rm(app, { recursive: true, force: true });
  });

  function hotUpdate(registry: TransformRegistry, server: ViteDevServer, event: TsazorHotUpdateOptions["event"], file: string, source?: string) {
    return tsazorHotUpdate(
      { event, file, read: () => source ?? "", server, registry, projectRoot: app },
      [],
    );
  }

  it("runs through real transform recording: a new Greeter tag re-transforms Home", async () => {
    const registry = new TransformRegistry();
    const server = fakeServer(app);
    const page = path.join(app, "Pages", "Home.tsazor");
    await writeFile(path.join(app, "Pages", "Home.tsazor"), '@page "/"\n<HmrBadge />\n');

    // The real transform branch records — incl. TZS005 (unresolvedTags).
    const result = await transformTsazor(await readFile(page, "utf8"), page, app, { hmr: false });
    expect(result.metadata.unresolvedTags).toEqual(["HmrBadge"]);
    registry.recordTransform(page, result.metadata, result.componentFiles);

    const badge = path.join(app, "Shared", "HmrBadge.tsazor");
    const nodes = await hotUpdate(registry, server, "create", badge, "<span>badge</span>\n");
    // 1. Vite's default edges (empty — the badge is not imported yet) contribute
    //    nothing: our plan alone supplies the page.
    expect(nodes).toBeDefined();
    expect((nodes as { id: string }[]).map((node) => node.id)).toContain("/Pages/Home.tsazor");
  });

  it("a disappearing CSS sidecar sends a full-reload payload", async () => {
    const registry = new TransformRegistry();
    const payloads: unknown[] = [];
    const server = fakeServer(app, payloads);
    const nodes = await hotUpdate(
      registry,
      server,
      "delete",
      path.join(app, "Shared", "Greeter.tsazor.css"),
    );
    // Vite's own propagation would already reach the owner via the CSS import
    // edge; our plan re-transforms it anyway (scope attribute).
    expect((nodes as { id: string }[]).map((node) => node.id)).toContain("/Shared/Greeter.tsazor");
    expect(payloads).toEqual([{ type: "full-reload" }]);
  });

  it("no plan and no Vite modules → undefined (Vite's own propagation continues)", async () => {
    const registry = new TransformRegistry();
    const server = fakeServer(app);
    const nodes = await hotUpdate(registry, server, "create", path.join(app, "Shared", "Unknown.tsazor"), "<p>x</p>\n");
    expect(nodes).toBeUndefined();
  });
});
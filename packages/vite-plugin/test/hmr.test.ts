/**
 * 4.1 — HMR-Invalidierung: Semantik von planInvalidation (pure), die
 * Windows-Regeln der Registry und die Umschaltung auf Vites Modul-Graph
 * (tsazorHotUpdate) mit einem Stub-Dev-Server.
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

/** Metadata-Objekt mit den Pflichtfeldern des Compilers. */
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

describe("planInvalidation: Semantik", () => {
  it("create: eine neue Komponente re-transformiert Dateien mit vorher unaufgelöstem Tag", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(page, metadata({ unresolvedTags: ["HmrBadge"] }), []);
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "HmrBadge.tsazor"), "create", registry, metadata()),
    );
    expect(plan.retransform.map((file) => path.basename(file).toLowerCase())).toEqual(["home.tsazor"]);
    expect(plan.routesModule).toBe(false);
  });

  it("create: eine neue @page-Seite aktualisiert das Routen-Manifest", async () => {
    const registry = new TransformRegistry();
    const plan = await planInvalidation(
      context(path.join(root, "Pages", "Imprint.tsazor"), "create", registry, metadata({ routeTemplates: ["/imprint"] })),
    );
    expect(plan.routesModule).toBe(true);
  });

  it("create: ein neues Layout, das eine Seite als @layout nennt, aktualisiert das Routen-Manifest", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(page, metadata({ layout: "FancyLayout" }), []);
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "FancyLayout.tsazor"), "create", registry, metadata()),
    );
    expect(plan.routesModule).toBe(true);
  });

  it("create: neue Komponente ohne Routen-Bezug berährt das Routen-Manifest nicht", async () => {
    const registry = new TransformRegistry();
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "Badge.tsazor"), "create", registry, metadata()),
    );
    expect(plan.routesModule).toBe(false);
    expect(plan.retransform).toEqual([]);
  });

  it("update: `@page` dazwischen re-transformiert nur Verbraucher und das Manifest", async () => {
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

  it("update: reine Markup-Änderung verändert das Routen-Manifest nicht", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(page, metadata(), [path.join(root, "Shared", "Badge.tsazor")]);
    const plan = await planInvalidation(
      context(path.join(root, "Shared", "Badge.tsazor"), "update", registry, metadata()),
    );
    expect(plan.routesModule).toBe(false);
    expect(plan.retransform).toEqual([page]);
  });

  it("delete: eine entfernte @page-Seite aktualisiert das Routen-Manifest und entlädt den Registry-Eintrag", async () => {
    const registry = new TransformRegistry();
    const page = path.join(root, "Pages", "Imprint.tsazor");
    registry.recordTransform(page, metadata({ routeTemplates: ["/imprint"] }), []);
    const plan = await planInvalidation(context(page, "delete", registry, undefined));
    expect(plan.routesModule).toBe(true);
    expect(registry.get(page)).toBeUndefined();
  });

  it("_Imports.tsazor: Änderung re-transformiert alle Dateien darunter (via Scanner)", async () => {
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

  it("_Imports.tsazor: geändertes @layout aktualisiert das Routen-Manifest", async () => {
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

  it("_Imports.tsazor ohne vorherigen Eintrag (Startup) aktualisiert das Manifest nicht", async () => {
    const registry = new TransformRegistry();
    const importsFile = path.join(root, "_Imports.tsazor");
    const plan = await planInvalidation(
      context(importsFile, "update", registry, metadata({ layout: "MainLayout" }), {
        listTsazorUnder: async () => [],
      }),
    );
    expect(plan.routesModule).toBe(false);
  });

  it("Code-behind (.tsazor.ts): Besitzer und Tag-Verbraucher werden neu transformiert", async () => {
    const registry = new TransformRegistry();
    const owner = path.join(root, "Shared", "Badge.tsazor");
    const consumer = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(consumer, metadata(), [owner]);
    const plan = await planInvalidation(context(`${owner}.ts`, "update", registry, undefined));
    const touched = plan.retransform.map((file) => normalizeFileKey(file)).sort();
    expect(touched).toEqual([normalizeFileKey(owner), normalizeFileKey(consumer)].sort());
  });

  it("CSS-Sidecar: Änderung macht Vite selbst; Hinzufügen re-transformiert den Besitzer", async () => {
    const registry = new TransformRegistry();
    const owner = path.join(root, "Shared", "Badge.tsazor");
    const update = await planInvalidation(context(`${owner}.css`, "update", registry, undefined));
    expect(update).toEqual({ retransform: [], routesModule: false, fullReload: false });

    const create = await planInvalidation(context(`${owner}.css`, "create", registry, undefined));
    expect(create.retransform).toEqual([owner]);
    expect(create.fullReload).toBe(false);
  });

  it("CSS-Sidecar: Entfernen erzwingt einen vollen Reload (injizierte <style>-Tags überleben HMR nicht)", async () => {
    const registry = new TransformRegistry();
    const plan = await planInvalidation(
      context(`${path.join(root, "Shared", "Badge.tsazor")}.css`, "delete", registry, undefined),
    );
    expect(plan.fullReload).toBe(true);
    expect(plan.retransform).toEqual([path.join(root, "Shared", "Badge.tsazor")]);
  });

  it("beliebiges .ts (Basiskette): Rückwärtskanten aus dem 2.1-Cache werden übernommen", async () => {
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

  it("Entfernte Komponente: Verbraucher werden neu transformiert, Manifest nur bei Routen/Layout-Bezug", async () => {
    const registry = new TransformRegistry();
    const badge = path.join(root, "Shared", "Badge.tsazor");
    const consumer = path.join(root, "Pages", "Home.tsazor");
    registry.recordTransform(consumer, metadata(), [badge]);

    const plan = await planInvalidation(context(badge, "delete", registry, undefined));
    expect(plan.retransform).toEqual([consumer]);
    expect(plan.routesModule).toBe(false);
  });
});

describe("TransformRegistry: Windows-Pfade case-insensitive", () => {
  it("findet Einträge über Schreibweise hinweg (Backslashes vs. POSIX, Groß/klein)", () => {
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

  it("dedupliziert den Selbst-Eintrag: die geänderte Datei selbst ist nicht im Plan", async () => {
    const registry = new TransformRegistry();
    const file = path.join(root, "Pages", "Self.tsazor");
    registry.recordTransform(file, metadata(), []);
    const plan = await planInvalidation(
      context(file, "update", registry, undefined, { dependentsOf: () => [file] }),
    );
    expect(plan.retransform).toEqual([]);
  });
});

describe("tsazorHotUpdate: Umschaltung auf den Modul-Graph", () => {
  /** Stub-Dev-Server: Modulgraph per URL/ID, HMR-Kanal zeichnet Payloads auf. */
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

  it("durchläuft echte Transform-Aufzeichnung: neues Greeter-Tag lässt Home neu transformieren", async () => {
    const registry = new TransformRegistry();
    const server = fakeServer(app);
    const page = path.join(app, "Pages", "Home.tsazor");
    await writeFile(path.join(app, "Pages", "Home.tsazor"), '@page "/"\n<HmrBadge />\n');

    // Der echte Transform-Zweig zeichnet auf — inkl. TZS005 (unresolvedTags).
    const result = await transformTsazor(await readFile(page, "utf8"), page, app, { hmr: false });
    expect(result.metadata.unresolvedTags).toEqual(["HmrBadge"]);
    registry.recordTransform(page, result.metadata, result.componentFiles);

    const badge = path.join(app, "Shared", "HmrBadge.tsazor");
    const nodes = await hotUpdate(registry, server, "create", badge, "<span>badge</span>\n");
    // 1. Vites Standard-Kanten (leer — das Badge ist noch nicht importiert) sind
    //    keine: unser Plan liefert allein die Seite.
    expect(nodes).toBeDefined();
    expect((nodes as { id: string }[]).map((node) => node.id)).toContain("/Pages/Home.tsazor");
  });

  it("CSS-Sidecar-Verschwinden sendet einen Full-Reload-Payload", async () => {
    const registry = new TransformRegistry();
    const payloads: unknown[] = [];
    const server = fakeServer(app, payloads);
    const nodes = await hotUpdate(
      registry,
      server,
      "delete",
      path.join(app, "Shared", "Greeter.tsazor.css"),
    );
    // Vites eigene Ausbreitung würde den Besitzer schon via CSS-Import-Edge
    // erreichen; unser Plan re-transformiert ihn trotzdem (Scope-Attribut).
    expect((nodes as { id: string }[]).map((node) => node.id)).toContain("/Shared/Greeter.tsazor");
    expect(payloads).toEqual([{ type: "full-reload" }]);
  });

  it("kein Plan und keine Vite-Module → undefined (Vites eigene Ausbreitung läuft weiter)", async () => {
    const registry = new TransformRegistry();
    const server = fakeServer(app);
    const nodes = await hotUpdate(registry, server, "create", path.join(app, "Shared", "Unknown.tsazor"), "<p>x</p>\n");
    expect(nodes).toBeUndefined();
  });
});
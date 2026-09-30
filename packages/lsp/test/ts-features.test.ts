/**
 * v2 feature-layer tests: context routing, completions (direct mapping and
 * variant mechanism), definition translation and diagnostic mapping — over a
 * temp workspace with a typed sidecar chain (same fixture as ts-service).
 */
import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeSource, type AnalyzedFile } from "../src/analysis";
import { TsazorTypeService, type ShadowEntry } from "../src/ts-service";
import {
  classifyCodeContext,
  prettifyHoverDisplay,
  sanitizeDoc,
  tsCompletions,
  tsDefinition,
  tsDiagnostics,
  tsHover,
} from "../src/ts-features";

let root = "";
let service: TsazorTypeService;
let tickerEntry: ShadowEntry | null = null;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-features-"));
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await writeFile(path.join(root, "_Imports.tsazor"), "@using ./Shared\n");

  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  await mkdir(rt, { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    path.join(rt, "package.json"),
    JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }),
  );
  writeFileSync(
    path.join(root, "node_modules", "@tsazor", "runtime", "index.d.ts"),
    // Mirrors the real runtime signatures the generated bind/handler code
    // relies on (shaped like packages/runtime/src; addEventHandler is
    // `EventCallback<any>` — a `never` would infer lambda params to never).
    "export declare interface RenderTreeBuilder { openElement(seq: number, tag: string): void; closeElement(): void; addAttribute(seq: number, name: string, value?: unknown): void; addEventHandler(seq: number, name: string, callback: EventCallback<any>, flags?: number): void; addContent(seq: number, value: unknown): void; }\n" +
      "export declare class ComponentBase { protected buildRenderTree(b: RenderTreeBuilder): void {} }\n" +
      "export declare class EventCallback<TArg = unknown> { static bind<TArg>(receiver: ComponentBase, delegate: ((arg: TArg) => void | Promise<void>) | EventCallback<TArg>): EventCallback<TArg>; }\n" +
      "export declare const Parameter: ParameterDecorator;\n",
  );

  await writeFile(
    path.join(root, "Pages", "Ticker.tsazor.ts"),
    'import { ComponentBase } from "@tsazor/runtime";\nimport { TickerStore } from "./TickerStore";\n\nexport default class TickerBase extends ComponentBase {\n    ticker = new TickerStore();\n}\n',
  );
  await writeFile(
    path.join(root, "Pages", "TickerStore.ts"),
    "export interface PricePoint { price: number; time: number; }\n\nexport class TickerStore {\n    count = 0;\n    price = 0;\n    priceText = \"$0\";\n    lastError: string | null = null;\n    points: PricePoint[] = [];\n}\n",
  );
  await writeFile(path.join(root, "Shared", "Alert.tsazor"), '<div class="alert">@Variant</div>\n\n@code {\n    @Parameter() Variant?: string;\n}\n');
  const tickerSource = '<Alert Variant="@mode" />\n<p>@ticker.points.length</p>\n\n@code {\n    priceText = "";\n    mode = "hot";\n}\n';
  await writeFile(path.join(root, "Pages", "Ticker.tsazor"), tickerSource);

  service = new TsazorTypeService(root);
  await service.ensureTsazor(path.join(root, "Shared", "Alert.tsazor"));
  tickerEntry = await service.ensureTsazor(path.join(root, "Pages", "Ticker.tsazor"), tickerSource);
});

afterAll(async () => {
  service?.dispose();
  await rm(root, { recursive: true, force: true });
});

/** Probes with a shared code-behind sidecar (inherited `ticker` member). */
const PROBE_SIDECAR_SRC =
  'import { ComponentBase } from "@tsazor/runtime";\nimport { TickerStore } from "./TickerStore";\n\nexport default class %NAME%Base extends ComponentBase {\n    ticker = new TickerStore();\n}\n';
async function ensureProbe(name: string, source: string): Promise<ShadowEntry | null> {
  await writeFile(path.join(root, "Pages", `${name}.tsazor.ts`), PROBE_SIDECAR_SRC.replace("%NAME%", name));
  return service.ensureTsazor(path.join(root, "Pages", `${name}.tsazor`), source);
}

async function analyzed(source: string, name = "Ticker.tsazor"): Promise<AnalyzedFile> {
  return analyzeSource(path.join(root, "Pages", name), source, root);
}

describe("classifyCodeContext", () => {
  it("routes code blocks and expression positions to the TS layer", async () => {
    const doc = await analyzed('<Alert Variant="@mo" />\n\n@code {\n    mode = "x";\n}\n');
    // `Variant="@mo` — cursor mid-word inside the attribute value (line 0: '@'=16).
    expect(classifyCodeContext(doc, 0, 19)).toBe("code");
    // Inside @code (line 2).
    expect(classifyCodeContext(doc, 2, 6)).toBe("code");
    // Plain markup text (line 0, col 0) and attribute-name positions stay v1.
    expect(classifyCodeContext(doc, 0, 0)).toBe("markup");
    expect(classifyCodeContext(doc, 0, 8)).toBe("markup");
  });
});

describe("tsCompletions", () => {
  it("completes members after `this.` inside @code (direct mapping)", async () => {
    const doc = await analyzed('<p>@ticker.points.length</p>\n\n@code {\n    probe = this.\n}\n');
    const entry = await ensureProbe("Probe2", doc.source);
    expect(entry).not.toBeNull();
    // End of "    probe = this." — line 3, cursor after the trailing dot.
    const candidates = await tsCompletions(service, entry!, doc, 3, 17);
    expect(candidates).not.toBeNull();
    // `this` is the component class: `probe` comes from the @code block,
    // `ticker` is inherited from the code-behind sidecar.
    const labels = (candidates ?? []).map((c) => c.label);
    expect(labels).toContain("ticker");
    expect(labels).toContain("probe");
  });

  it("completes a bare markup prefix via the variant patch", async () => {
    const doc = await analyzed('<p>@ti</p>\n\n@code {\n    priceText = "";\n}\n');
    const entry = await ensureProbe("Probe3", doc.source);
    expect(entry).not.toBeNull();
    // Cursor right after `@ti` on line 0 (col 6 = end of the word).
    const candidates = await tsCompletions(service, entry!, doc, 0, 6);
    expect(candidates).not.toBeNull();
    const labels = (candidates ?? []).map((c) => c.label);
    expect(labels).toContain("ticker");
  });

  it("completes a chain after a dot directly from the baked shadow", async () => {
    const doc = await analyzed('<p>@ticker.</p>\n\n@code {\n    mode = "x";\n}\n');
    const entry = await ensureProbe("Probe4", doc.source);
    expect(entry).not.toBeNull();
    // Cursor right after the dot on line 0 (ticker = 4..9, dot = 10 → cursor 11).
    const labels = (await tsCompletions(service, entry!, doc, 0, 11) ?? []).map((c) => c.label);
    // TickerStore members — typed, from a real .ts, without any patch.
    expect(labels).toContain("points");
    expect(labels).toContain("priceText");
  });

  it("returns null for unmapped plain-markup positions", async () => {
    const doc = await analyzed("<div>hello</div>\n");
    const entry = await ensureProbe("Probe5", doc.source);
    expect(await tsCompletions(service, entry!, doc, 0, 8)).toBeNull();
  });
});

describe("tsHover and tsDefinition", () => {
  it("hovers `points` as PricePoint[] at the source position", () => {
    // `points` in `<p>@ticker.points.length</p>` spans columns 11..16.
    const info = tsHover(service, tickerEntry!, 1, 12);
    expect(info).not.toBeNull();
    expect(info!.markdown).toContain("PricePoint[]");
  });

  it("defines `ticker` into the code-behind sidecar with a real range", () => {
    const targets = tsDefinition(service, tickerEntry!, 1, 5); // inside `ticker`
    expect(targets).not.toBeNull();
    const target = targets!.find((t) => t.file.endsWith("Ticker.tsazor.ts"));
    expect(target).toBeDefined();
    // The sidecar declares `ticker` on 0-based line 4 (`    ticker = new TickerStore();`,
    // after import/export blank lines) and the mapped span covers real tokens.
    expect(target!.line).toBe(4);
    expect(target!.character).toBeGreaterThanOrEqual(4);
  });

  it("maps a semantic diagnostic (TS2322) back onto the @code line", async () => {
    const badSource = '<p>@ticker.points.length</p>\n\n@code {\n    priceText: string = 42;\n}\n';
    const entry = await service.ensureTsazor(path.join(root, "Pages", "Bad2.tsazor"), badSource);
    const diags = tsDiagnostics(service, entry!);
    const ts2322 = diags.find((d) => d.code === 2322);
    expect(ts2322).toBeDefined();
    // The error anchors inside the verbatim `    priceText: string = 42;` line.
    expect(ts2322!.line).toBe(3);
    expect(ts2322!.message).toContain("number");
    expect(ts2322!.message).toContain("string");
  });

  it("maps a @code parse error (syntactic bucket) onto the offending line", async () => {
    // `pass word` breaks the member declaration — the shadow catches it in
    // getSyntacticDiagnostics, not getSemanticDiagnostics.
    const typoSource = '<p>@ticker.points.length</p>\n\n@code {\n    private pass word = "";\n}\n';
    const entry = await service.ensureTsazor(path.join(root, "Pages", "TypoProbe.tsazor"), typoSource);
    const diags = tsDiagnostics(service, entry!);
    // Without the syntactic bucket the editor would stay silent until esbuild
    // rejects the transpile at request time.
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0]!.line).toBe(3);
  });

  it("keeps the synthetic bind handler inference-clean (no `e`-is-never TS2339)", async () => {
    // The generated `EventCallback.bind(this, (e) => { … e.target … })` sits in
    // a synthetic region: `e.target` errors only when the callback parameter
    // infers to never via a contextual EventCallback<never>. Nothing on this
    // page is wrong — the mapped diagnostics must stay empty.
    const bindSource = '<input @bind="mode" />\n\n@code {\n    mode = "";\n}\n';
    const entry = await service.ensureTsazor(path.join(root, "Pages", "BindProbe.tsazor"), bindSource);
    const diags = tsDiagnostics(service, entry!);
    expect(diags.find((d) => d.code === 2339 || d.code === 2345)).toBeUndefined();
  });

  it("drops TS2307 for static-asset imports and TS2564 for @Parameter properties", async () => {
    const source =
      '@Parameter() variant?: string;\n\n@code {\n    const css = await import("./x.css");\n    priceText: string = 42;\n}\n';
    const entry = await service.ensureTsazor(path.join(root, "Pages", "FilterProbe.tsazor"), source);
    const diags = tsDiagnostics(service, entry!);
    expect(diags.find((d) => d.code === 2307)).toBeUndefined(); // "./x.css" — vite serves it
    expect(diags.find((d) => d.code === 2564)).toBeUndefined(); // `variant` — set by the renderer
    // Real errors on ordinary verbatim @code lines survive the filters.
    expect(diags.find((d) => d.code === 2322)).toBeDefined();
  });

  it("prettifies component-alias quick info to the real component name", () => {
    // What TS renders for `import { ValidationMessage as __tsazor_comp_ValidationMessage } from "@tsazor/runtime"`.
    const alias = "(alias) class __tsazor_comp_ValidationMessage\nimport __tsazor_comp_ValidationMessage";
    expect(prettifyHoverDisplay(alias)).toBe("class ValidationMessage");
    // Other symbols (no compiler alias) pass through untouched.
    const plain = "(property) TickerStore.points: PricePoint[]";
    expect(prettifyHoverDisplay(plain)).toBe(plain);
  });

  it("sanitizes runtime design-note docstrings to Tsazor-native descriptions", () => {
    // The full ValidationMessage docstrings (runtime/src/forms/validation.ts).
    expect(sanitizeDoc(
      "Blazor's ValidationMessage<T>: shows validation messages for one field.\n" +
      "v1 deviation: `For` is a plain field name string (Blazor uses an expression).",
    )).toBe("shows validation messages for one field.");
    // Analogue/equivalent headings.
    expect(sanitizeDoc("Blazor's IServiceCollection analogue: register factories, then build a provider."))
      .toBe("register factories, then build a provider.");
    expect(sanitizeDoc("Blazor's InputText: single-line string input."))
      .toBe("single-line string input.");
    // Lineage-only docs (no colon heading) vanish entirely.
    expect(sanitizeDoc("Blazor's OnInitialized / OnInitializedAsync.")).toBe("");
    expect(sanitizeDoc("Renderer-side state for one component instance (Blazor's ComponentState).")).toBe("");
    // Non-runtime docs pass through untouched.
    const own = "The pizza checkout: collects the delivery address.\n";
    expect(sanitizeDoc(own)).toBe("The pizza checkout: collects the delivery address.");
  });
});
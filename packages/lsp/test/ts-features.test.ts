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
import { TasorTypeService, type ShadowEntry } from "../src/ts-service";
import {
  classifyCodeContext,
  tsCompletions,
  tsDefinition,
  tsDiagnostics,
  tsHover,
} from "../src/ts-features";

let root = "";
let service: TasorTypeService;
let tickerEntry: ShadowEntry | null = null;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tasor-features-"));
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await writeFile(path.join(root, "_Imports.tazor"), "@using ./Shared\n");

  const rt = path.join(root, "node_modules", "@tasor", "runtime");
  await mkdir(rt, { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    path.join(rt, "package.json"),
    JSON.stringify({ name: "@tasor/runtime", version: "0.1.0", types: "./index.d.ts" }),
  );
  writeFileSync(
    path.join(root, "node_modules", "@tasor", "runtime", "index.d.ts"),
    "export declare interface RenderTreeBuilder { openElement(seq: number, tag: string): void; closeElement(): void; addAttribute(seq: number, name: string, value?: unknown): void; addContent(seq: number, value: unknown): void; }\n" +
      "export declare class ComponentBase { protected buildRenderTree(b: RenderTreeBuilder): void {} }\n" +
      "export declare const Parameter: ParameterDecorator;\n",
  );

  await writeFile(
    path.join(root, "Pages", "Ticker.tazor.ts"),
    'import { ComponentBase } from "@tasor/runtime";\nimport { TickerStore } from "./TickerStore";\n\nexport default class TickerBase extends ComponentBase {\n    ticker = new TickerStore();\n}\n',
  );
  await writeFile(
    path.join(root, "Pages", "TickerStore.ts"),
    "export interface PricePoint { price: number; time: number; }\n\nexport class TickerStore {\n    count = 0;\n    price = 0;\n    priceText = \"$0\";\n    lastError: string | null = null;\n    points: PricePoint[] = [];\n}\n",
  );
  await writeFile(path.join(root, "Shared", "Alert.tazor"), '<div class="alert">@Variant</div>\n\n@code {\n    @Parameter() Variant?: string;\n}\n');
  const tickerSource = '<Alert Variant="@mode" />\n<p>@ticker.points.length</p>\n\n@code {\n    priceText = "";\n    mode = "hot";\n}\n';
  await writeFile(path.join(root, "Pages", "Ticker.tazor"), tickerSource);

  service = new TasorTypeService(root);
  await service.ensureTazor(path.join(root, "Shared", "Alert.tazor"));
  tickerEntry = await service.ensureTazor(path.join(root, "Pages", "Ticker.tazor"), tickerSource);
});

afterAll(async () => {
  service?.dispose();
  await rm(root, { recursive: true, force: true });
});

/** Probes with a shared code-behind sidecar (inherited `ticker` member). */
const PROBE_SIDECAR_SRC =
  'import { ComponentBase } from "@tasor/runtime";\nimport { TickerStore } from "./TickerStore";\n\nexport default class %NAME%Base extends ComponentBase {\n    ticker = new TickerStore();\n}\n';
async function ensureProbe(name: string, source: string): Promise<ShadowEntry | null> {
  await writeFile(path.join(root, "Pages", `${name}.tazor.ts`), PROBE_SIDECAR_SRC.replace("%NAME%", name));
  return service.ensureTazor(path.join(root, "Pages", `${name}.tazor`), source);
}

async function analyzed(source: string, name = "Ticker.tazor"): Promise<AnalyzedFile> {
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
    const target = targets!.find((t) => t.file.endsWith("Ticker.tazor.ts"));
    expect(target).toBeDefined();
    // The sidecar declares `ticker` on 0-based line 4 (`    ticker = new TickerStore();`,
    // after import/export blank lines) and the mapped span covers real tokens.
    expect(target!.line).toBe(4);
    expect(target!.character).toBeGreaterThanOrEqual(4);
  });

  it("maps a semantic diagnostic (TS2322) back onto the @code line", async () => {
    const badSource = '<p>@ticker.points.length</p>\n\n@code {\n    priceText: string = 42;\n}\n';
    const entry = await service.ensureTazor(path.join(root, "Pages", "Bad2.tazor"), badSource);
    const diags = tsDiagnostics(service, entry!);
    const ts2322 = diags.find((d) => d.code === 2322);
    expect(ts2322).toBeDefined();
    // The error anchors inside the verbatim `    priceText: string = 42;` line.
    expect(ts2322!.line).toBe(3);
    expect(ts2322!.message).toContain("number");
    expect(ts2322!.message).toContain("string");
  });
});
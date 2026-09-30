/**
 * TsazorTypeService tests over a temp workspace: real ts.LanguageService over
 * shadow modules — inheritance through the code-behind sidecar, imports from
 * typed .ts files, cross-shadow component chains, and the variant-patch
 * completion mechanism.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TsazorTypeService, shadowOffsetToPos, type ShadowEntry } from "../src/ts-service";

let root = "";
let service: TsazorTypeService;
let ticker: ShadowEntry | null = null;
let alert: ShadowEntry | null = null;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-ts-"));
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await writeFile(path.join(root, "_Imports.tsazor"), "@using ./Shared\n");

  // @tsazor/runtime stub: typed ComponentBase + RenderTreeBuilder + Parameter.
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  await mkdir(rt, { recursive: true });
  writeFileSync(
    path.join(rt, "package.json"),
    JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }),
  );
  writeFileSync(
    path.join(rt, "index.d.ts"),
    [
      "export declare interface RenderTreeBuilder {",
      "  openElement(seq: number, tag: string): void;",
      "  closeElement(): void;",
      "  openComponent(seq: number, componentType: unknown): void;",
      "  closeComponent(): void;",
      "  openRegion(seq: number): void;",
      "  closeRegion(): void;",
      "  addAttribute(seq: number, name: string, value?: unknown): void;",
      "  addContent(seq: number, value: unknown): void;",
      "}",
      "export declare class ComponentBase {",
      "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
      "}",
      "export declare const Parameter: ParameterDecorator;",
      "",
    ].join("\n"),
  );

  // Code-behind sidecar extends the runtime base and owns a typed store.
  await writeFile(
    path.join(root, "Pages", "Ticker.tsazor.ts"),
    [
      'import { ComponentBase } from "@tsazor/runtime";',
      'import { TickerStore } from "./TickerStore";',
      "",
      "export default class TickerBase extends ComponentBase {",
      "    ticker = new TickerStore();",
      "}",
      "",
    ].join("\n"),
  );
  // Own sidecars for the Probe/Prefix test docs (inherited `ticker`).
  const probeSidecar =
    'import { ComponentBase } from "@tsazor/runtime";\nimport { TickerStore } from "./TickerStore";\n\nexport default class %CLASS%Base extends ComponentBase {\n    ticker = new TickerStore();\n}\n';
  await writeFile(path.join(root, "Pages", "Probe.tsazor.ts"), probeSidecar.replace("%CLASS%", "Probe"));
  await writeFile(path.join(root, "Pages", "Prefix.tsazor.ts"), probeSidecar.replace("%CLASS%", "Prefix"));
  await writeFile(
    path.join(root, "Pages", "TickerStore.ts"),
    [
      "export interface PricePoint { price: number; time: number; }",
      "",
      "export class TickerStore {",
      "    count = 0;",
      "    price = 0;",
      '    priceText = "$0";',
      "    lastError: string | null = null;",
      "    points: PricePoint[] = [];",
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "Shared", "Alert.tsazor"),
    '<div class="alert">@Variant</div>\n\n@code {\n    @Parameter() Variant?: string;\n}\n',
  );
  await writeFile(
    path.join(root, "Pages", "Ticker.tsazor"),
    [
      "<Alert Variant=\"@mode\" />",
      "<p>@ticker.points.length</p>",
      "",
      "@code {",
      '    priceText = "";',
      '    mode = "hot";',
      "}",
    ].join("\n"),
  );

  service = new TsazorTypeService(root);
  alert = await service.ensureTsazor(path.join(root, "Shared", "Alert.tsazor"));
  ticker = await service.ensureTsazor(path.join(root, "Pages", "Ticker.tsazor"));
});

afterAll(async () => {
  service?.dispose();
  await rm(root, { recursive: true, force: true });
});

describe("TsazorTypeService", () => {
  it("type-checks the shadow graph across the cross-shadow component chain", async () => {
    // With Alert's shadow registered, the whole graph resolves cleanly.
    const diags = service.semanticDiagnosticsOnShadow(ticker!);
    expect(diags).toEqual([]);
  });

  it("completes inherited and own members after `this.` (open doc)", async () => {
    const source = [
      "<p>@ticker.points.length</p>",
      "",
      "@code {",
      '    priceText = "";',
      "    probe = this.",
      "}",
    ].join("\n");
    const entry = await service.openTsazor(path.join(root, "Pages", "Probe.tsazor"), source);
    expect(entry).not.toBeNull();
    const genLine = entry!.shadow.code.split("\n").findIndex((l) => l.includes("probe = this."));
    expect(genLine).toBeGreaterThan(0);
    // Cursor right after the trailing dot: verbatim mapping (2-space class indent).
    const srcCol = source.split("\n")[4]!.length; // "    probe = this." → after "."
    const gen = entry!.shadow.map.srcToGen(4, srcCol);
    const info = service.completionsOnShadow(entry!, gen!.line, gen!.column);
    const names = (info?.entries ?? []).map((e) => e.name);
    expect(names).toContain("ticker");  // inherited from the code-behind sidecar
    expect(names).toContain("priceText"); // own @code member
  });

  it("completes via the variant patch on a bare markup prefix", async () => {
    const entry = await service.openTsazor(
      path.join(root, "Pages", "Prefix.tsazor"),
      "<p>@ti</p>\n\n@code {\n    priceText = \"\";\n}\n",
    );
    expect(entry).not.toBeNull();
    // The `<p>@ti</p>` line: `ti` spans columns 4..6.
    const variant = await service.buildVariant(entry!, "<p>@ti</p>\n\n@code {\n    priceText = \"\";\n}\n", {
      line: 0,
      start: 4,
      end: 6,
      replacement: "this.ti",
    });
    expect(variant).not.toBeNull();
    const info = service.completionsOnShadow(variant!.entry, variant!.cursor.line, variant!.cursor.column);
    const names = (info?.entries ?? []).map((e) => e.name);
    expect(names).toContain("ticker");
  });

  it("hovers typed members from an imported .ts file (PricePoint[])", () => {
    // `points` in source `<p>@ticker.points.length</p>` starts at column 11.
    const gen = ticker!.shadow.map.srcToGen(1, 11);
    const info = service.quickInfoOnShadow(ticker!, gen!.line, gen!.column);
    const text = (info?.displayParts ?? []).map((p) => p.text).join("");
    expect(text).toContain("PricePoint[]");
  });

  it("defines members into the real .ts files", () => {
    // `ticker` (source col 4) → the code-behind sidecar member declaration.
    const tickerGen = ticker!.shadow.map.srcToGen(1, 5);
    const defs1 = service.definitionOnShadow(ticker!, tickerGen!.line, tickerGen!.column);
    expect(defs1.some((d) => d.fileName.replace(/\\/g, "/").endsWith("Ticker.tsazor.ts"))).toBe(true);

    // `points` (source col 11) → TickerStore.ts — the type comes from a real file.
    const pointsGen = ticker!.shadow.map.srcToGen(1, 11);
    const defs2 = service.definitionOnShadow(ticker!, pointsGen!.line, pointsGen!.column);
    expect(defs2.some((d) => d.fileName.replace(/\\/g, "/").endsWith("TickerStore.ts"))).toBe(true);
  });

  it("maps TS error positions back onto the .tsazor source lines", async () => {
    // A declared type in @code creates a real TS2322 verbatim in the shadow:
    // the field initializer's `42` is the diagnostic start.
    const badSource = [
      "<p>@ticker.points.length</p>",
      "",
      "@code {",
      "    priceText: string = 42;",
      "}",
    ].join("\n");
    const entry = await service.openTsazor(path.join(root, "Pages", "Bad.tsazor"), badSource);
    expect(entry).not.toBeNull();
    const diags = service.semanticDiagnosticsOnShadow(entry!);
    const ts2322 = diags.find((d) => d.code === 2322); // Type 'number' is not assignable to type 'string'
    expect(ts2322).toBeDefined();
    const genPos = shadowOffsetToPos(entry!.shadow.code, ts2322!.start);
    const srcPos = entry!.shadow.map.genToSrc(genPos.line, genPos.column);
    // Inside the verbatim @code line — the statement's content column.
    expect(srcPos).toEqual({ line: 3, character: 4 });
  });

  it("caches on-demand shadows by mtime", async () => {
    const first = await service.ensureTsazor(path.join(root, "Shared", "Alert.tsazor"));
    const second = await service.ensureTsazor(path.join(root, "Shared", "Alert.tsazor"));
    expect(second!.version).toBe(first!.version);
    // After a rebuild (mtime change — simulated here by a fresh open), version bumps.
    const rebuilt = await service.openTsazor(path.join(root, "Shared", "Alert.tsazor"), "<b>@Variant</b>\n");
    expect(rebuilt!.version).not.toBe(first!.version);
  });
});
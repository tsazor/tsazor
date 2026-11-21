/**
 * Roadmap 2.4: typed checks in the type layer — real TS diagnostics for a
 * component's attribute values, typed slot contexts, inferred `TItem`
 * (through the program's types) and the typed `@ref` fixes; plus the T4
 * project scan shadowing closed files.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TsazorTypeService, shadowOffsetToPos } from "../src/ts-service";
import { tsDiagnostics } from "../src/ts-features";

let root = "";
let service: TsazorTypeService;

const GRID = [
  "@typeparam TItem",
  "<table>@foreach (const item of Items) {<tr>@RowTemplate(item)</tr>}</table>",
  "@code {",
  "    @Parameter() Items: TItem[] = [];",
  "    @Parameter() RowTemplate!: RenderFragment<TItem>;",
  "}",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-typed-"));
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await writeFile(path.join(root, "_Imports.tsazor"), "@using ./Shared\n");

  // @tsazor/runtime stub with the 2.4 component-reference capture API.
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
      "  addContent(seq: number, value: (builder: RenderTreeBuilder) => void): void;",
      "  addContent(seq: number, value: unknown): void;",
      "  addMarkupContent(seq: number, value: string | null): void;",
      "  addElementReferenceCapture(seq: number, action: (element: Element) => void): void;",
      "  addComponentReferenceCapture(seq: number, action: (component: unknown) => void): void;",
      "}",
      "export type Attachment<E extends Element = Element> = (element: E) => void | (() => void);",
      "export declare function addAttachment<E extends Element = Element>(builder: RenderTreeBuilder, seq: number, name: string, value: Attachment<E> | null | undefined | false): void;",
      "export declare function bindMethod<T>(receiver: unknown, method: T): T;",
      "export declare class ComponentBase {",
      "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
      "}",
      "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;",
      "export declare function CascadingTypeParameter(...names: string[]): (value: abstract new (...args: never[]) => unknown, context: ClassDecoratorContext) => void;",
      "export type RenderFragment = (builder: RenderTreeBuilder) => void;",
      "",
    ].join("\n"),
  );

  await writeFile(path.join(root, "Models.ts"), "export interface Person { name: string; age: number; }\n");
  await writeFile(path.join(root, "Shared", "Grid.tsazor"), GRID);

  const good = [
    '<Grid TItem="Person" Items="people"><RowTemplate><td>@context.name</td></RowTemplate></Grid>',
    "",
    '@import { Person } from "./Models";',
    "@code {",
    "    private people: Person[] = [{ name: \"a\", age: 1 }];",
    "}",
    "",
  ].join("\n");
  await writeFile(path.join(root, "Good.tsazor"), good);

  // Two typed bugs: `42` is no Person[]; the slot context is a Person (no
  // `nickname`).
  const bad = [
    '<Grid TItem="Person" Items="@42"><RowTemplate><td>@context.nickname</td></RowTemplate></Grid>',
    "",
    '@import { Person } from "./Models";',
    "@code {",
    "    private people: Person[] = [{ name: \"a\", age: 1 }];",
    "}",
    "",
  ].join("\n");
  await writeFile(path.join(root, "Bad.tsazor"), bad);

  // TItem inferred from the program: `people: Person[]` → TItem = Person.
  await writeFile(
    path.join(root, "Infer.tsazor"),
    [
      '<Grid Items="people"><RowTemplate><td>@context.name</td></RowTemplate></Grid>',
      "",
      '@import { Person } from "./Models";',
      "@code {",
      "    private people: Person[] = [{ name: \"a\", age: 1 }];",
      "}",
      "",
    ].join("\n"),
  );

  // Blazor's [CascadingTypeParameter]: the table's TGridItem (inferred from
  // Items) flows to the columns inside it; TProp follows from the lambda.
  await writeFile(
    path.join(root, "Shared", "Table.tsazor"),
    [
      "@typeparam TGridItem",
      '@attribute @CascadingTypeParameter("TGridItem")',
      "<table>@ChildContent</table>",
      "@code {",
      "    @Parameter() Items: TGridItem[] = [];",
      "    @Parameter() ChildContent?: RenderFragment;",
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "Shared", "Column.tsazor"),
    [
      "@typeparam TGridItem",
      "@typeparam TProp",
      "<th>column</th>",
      "@code {",
      "    @Parameter() Property!: (item: TGridItem) => TProp;",
      "    @Parameter() Format?: (value: TProp) => string;",
      "}",
      "",
    ].join("\n"),
  );
  const cascade = (property: string, format: string): string =>
    [
      `<Table Items="people"><Column Property="${property}" Format="${format}" /></Table>`,
      "",
      '@import { Person } from "./Models";',
      "@code {",
      '    private people: Person[] = [{ name: "a", age: 1 }];',
      "}",
      "",
    ].join("\n");
  await writeFile(path.join(root, "Cascade.tsazor"), cascade("(p) => p.name", "(v) => v.toUpperCase()"));
  // A missing member on the row (TS2339); a string method on the number column (TS2339).
  await writeFile(path.join(root, "CascadeBad.tsazor"), cascade("(p) => p.nickname", "(v) => v"));
  await writeFile(path.join(root, "CascadeBadProp.tsazor"), cascade("(p) => p.age", "(v) => v.toUpperCase()"));

  // QuickGrid's ItemsProvider: TGridItem from a type argument of the provider's own generic type (the
  // grid's Items, declared first, isn't set).
  await writeFile(path.join(root, "Shared", "provider.ts"), "export type RowsProvider<T> = (start: number) => Promise<T[]>;\n");
  await writeFile(
    path.join(root, "Shared", "ProviderTable.tsazor"),
    [
      "@typeparam TGridItem",
      '@attribute @CascadingTypeParameter("TGridItem")',
      '@import type { RowsProvider } from "./provider"',
      "<table>@ChildContent</table>",
      "@code {",
      "    @Parameter() Items?: TGridItem[];",
      "    @Parameter() ItemsProvider?: RowsProvider<TGridItem>;",
      "    @Parameter() ChildContent?: RenderFragment;",
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "CascadeUninferred.tsazor"),
    ['<ProviderTable><Column Property="(p) => p.name" /></ProviderTable>', ""].join("\n"),
  );
  await writeFile(
    path.join(root, "CascadeProvider.tsazor"),
    [
      '<ProviderTable ItemsProvider="provider"><Column Property="(p) => p.name" Format="(v) => v.toUpperCase()" /></ProviderTable>',
      "",
      '@import { Person } from "./Models";',
      '@import type { RowsProvider } from "./Shared/provider";',
      "@code {",
      "    private provider!: RowsProvider<Person>;",
      "}",
      "",
    ].join("\n"),
  );

  // TS2740 regression: `@ref` on `<input>` must type the capture as the
  // tag's interface so the field typechecks.
  await writeFile(
    path.join(root, "Ref.tsazor"),
    [
      '<input @ref="box" />',
      "<p>@(box?.value.length)</p>",
      "",
      "@code {",
      "    private box?: HTMLInputElement;",
      "}",
      "",
    ].join("\n"),
  );

  // F2: `@attach` is checked as `Attachment<tag interface>` — a lambda's
  // parameter is the tag's interface, a method group binds and typechecks.
  await writeFile(
    path.join(root, "Attach.tsazor"),
    [
      '<input @attach="selectAll" @attach:focus="focusInput" />',
      "<canvas @attach=\"(canvas) => { canvas.getContext('2d'); }\"></canvas>",
      '<svg @attach="(svg) => { svg.createSVGPoint(); }"></svg>',
      "",
      "@code {",
      "    focusInput = (input: HTMLInputElement) => input.focus();",
      "    selectAll(input: HTMLInputElement): () => void { input.select(); return () => input.blur(); }",
      "}",
      "",
    ].join("\n"),
  );
  // An input attachment on a <div> (TS2345), a missing member on the input (TS2339).
  await writeFile(
    path.join(root, "AttachBad.tsazor"),
    [
      '<div @attach="focusInput"></div>',
      '<input @attach="(input) => input.nope()" />',
      "",
      "@code {",
      "    focusInput = (input: HTMLInputElement) => input.focus();",
      "}",
      "",
    ].join("\n"),
  );

  // The RedirectToLogin pattern: a typo'd member (`this.nav` vs the injected
  // `this.Navigator`) surfaces through the shadow's TS2339.
  await writeFile(
    path.join(root, "Member.tsazor"),
    [
      "<p>@(name)</p>",
      "",
      "@code {",
      "    private navigator = { goTo(_url: string): void {} };",
      "    private name = \"n\";",
      "    private go(): void { this.nav.goTo(\"/login\"); }",
      "}",
      "",
    ].join("\n"),
  );

  // Text meant for a number parameter: `answer="hello"` reads the value as
  // the expression `hello` — the TS2339 gets a note why.
  await writeFile(path.join(root, "Shared", "Answer.tsazor"), "<p>@answer</p>\n@code {\n    @Parameter() answer?: number;\n}\n");
  await writeFile(path.join(root, "TextForNumber.tsazor"), '<Answer answer="hello" />\n<Answer answer="@missing" />\n');
});

afterAll(async () => {
  service?.dispose();
  await rm(root, { recursive: true, force: true });
});

const codes = async (file: string): Promise<Array<number | string>> =>
  service.semanticDiagnosticsOnShadow((await service.ensureTsazor(path.join(root, file)))!).map((d) => d.code);

describe("typed checks through the shadow program (2.4)", () => {
  beforeAll(async () => {
    service = new TsazorTypeService(root);
    await service.scanProject();
  });

  it("a well-typed component use produces no diagnostics", async () => {
    expect(await codes("Good.tsazor")).toEqual([]);
  });

  it("a wrong attribute value and a wrong slot member are TS diagnostics", async () => {
    // `42 satisfies Person[]`: no overlap (TS1360); the slot context is a
    // Person, `nickname` does not exist (TS2339).
    expect(await codes("Bad.tsazor")).toEqual(expect.arrayContaining([1360, 2339]));
  });

  it("TItem is inferred from the program's types", async () => {
    const entry = await service.ensureTsazor(path.join(root, "Infer.tsazor"));
    // No diagnostics on `@context.name`: the context is a Person.
    expect(await codes("Infer.tsazor")).toEqual([]);
    expect(entry!.shadow.code).toContain("(context: Person) =>");
  });

  it("@CascadingTypeParameter: the columns take TGridItem from their table, TProp from the lambda", async () => {

    expect(await codes("Cascade.tsazor")).toEqual([]);
    const entry = await service.ensureTsazor(path.join(root, "Cascade.tsazor"));
    expect(entry!.shadow.code).toContain("satisfies (item: Person) => string");
    expect(entry!.shadow.code).toContain("satisfies ((value: string) => string) | undefined");
    // TProp stays open after the row error: the Format lambda adds a follow-on 7006.
    expect(await codes("CascadeBad.tsazor")).toEqual(expect.arrayContaining([2339]));
    expect(await codes("CascadeBadProp.tsazor")).toEqual([2339]);
  });

  it("TGridItem is inferred from a type argument of the provider's generic type, as Razor infers it", async () => {
    expect(await codes("CascadeProvider.tsazor")).toEqual([]);
    const entry = await service.ensureTsazor(path.join(root, "CascadeProvider.tsazor"));
    expect(entry!.shadow.code).toContain("satisfies (item: Person) => string");
  });

  it("an error inside a grid whose TGridItem stays open names Razor's RZ10001 and the fix", async () => {
    const entry = await service.ensureTsazor(path.join(root, "CascadeUninferred.tsazor"));
    const messages = tsDiagnostics(service, entry!).map((d) => d.message);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => m.includes("Razor's RZ10001") && m.includes('<ProviderTable TGridItem="…">'))).toBe(true);
  });

  it("@ref on an element casts to the tag's interface (no TS2740)", async () => {
    expect(await codes("Ref.tsazor")).toEqual([]);
    const entry = await service.ensureTsazor(path.join(root, "Ref.tsazor"));
    expect(entry!.shadow.code).toContain('el as HTMLElementTagNameMap["input"]');
  });

  it("@attach is typed as Attachment<tag interface> (F2)", async () => {
    expect(await codes("Attach.tsazor")).toEqual([]);
    const entry = await service.ensureTsazor(path.join(root, "Attach.tsazor"));
    expect(entry!.shadow.code).toContain('addAttachment<HTMLElementTagNameMap["input"]>');
    expect(await codes("AttachBad.tsazor")).toEqual(expect.arrayContaining([2345, 2339]));
  });

  it("a typo'd member surfaces as TS2339 through the shadow", async () => {
    expect(await codes("Member.tsazor")).toEqual([2339]);
    const entry = await service.ensureTsazor(path.join(root, "Member.tsazor"));
    const diags = service.semanticDiagnosticsOnShadow(entry!);
    const sourceFile = diags.find((d) => d.code === 2339)!;
    const genPos = shadowOffsetToPos(entry!.shadow.code, sourceFile.start);
    const srcPos = entry!.shadow.map.genToSrc(genPos.line, genPos.column);
    // Mapped back into the `this.nav.goTo` line of the .tsazor file.
    expect(srcPos?.line).toBe(5);
  });

  it("text for a number parameter: the unknown name gets a note that the value is code, not text", async () => {
    const entry = await service.ensureTsazor(path.join(root, "TextForNumber.tsazor"));
    const diags = tsDiagnostics(service, entry!).filter((d) => d.code === 2339);
    expect(diags.map((d) => d.line)).toEqual([0, 1]);
    const [plain, explicit] = diags;
    expect(plain!.message).toBe(
      "Property 'hello' does not exist on type 'TextForNumber'. Note: 'answer' on <Answer> is a 'number' parameter, so its value is read as a TypeScript expression, not as text.",
    );
    // An explicit `@expr` is code by intent: no note.
    expect(explicit!.message).not.toContain("Note:");
  });
});
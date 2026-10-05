/**
 * Generator-Tests über das gecheckte OpenAPI-Beispiel (ASP.NET-Core-Stil):
 * Nullability-Regeln, DataAnnotations-Decorators aus den Schema-Constraints,
 * Enum-Aliase, allOf-Vererbung, Pfad-Interpolation, Query-Interfaces und
 * Envelope-Konstruktion — plus einen Typcheck des generierten Outputs.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import ts from "typescript";
import { generateClient } from "../src/generate.js";
import { loadOpenApiDocument, type OpenApiDocument } from "../src/openapi.js";

afterAll(async () => {
  const generated = path.resolve(import.meta.dirname, ".out-generate");
  if (existsSync(generated)) await rm(generated, { recursive: true, force: true });
});

const document: Promise<OpenApiDocument> = loadOpenApiDocument(
  path.join(import.meta.dirname, "fixtures", "openapi-sample.json").replace(/\\/g, "/"),
);

function classBodyOf(models: string, className: string): string {
  const start = models.indexOf(`export class ${className} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const lineStart = models.lastIndexOf("\n", start) === -1 ? 0 : models.lastIndexOf("\n", start) + 1;
  const end = models.indexOf("\n}", start);
  const body = models.slice(lineStart, end === -1 ? undefined : end + 2);
  return body;
}

describe("generateClient — models.ts", () => {
  it("mappt Nullability nach den vier Regeln", async () => {
    const generation = generateClient(await document, { clientName: "ContosoOrders" });
    const models = generation.files.find((f) => f.path === "models.ts")!.content;
    const orderBody = classBodyOf(models, "OrderDto");
    // required && !nullable ⇒ T (Primitive mit Default)
    expect(orderBody).toContain(`    id = 0;`);
    expect(orderBody).toContain(`    customerName = "";`);
    // required && nullable ⇒ `T | null = null`
    expect(orderBody).toContain(`    note: string | null = null;`);
    // optional && !nullable (CreateOrderDto.comment) ⇒ `?: T`
    const createBody = classBodyOf(models, "CreateOrderDto");
    expect(createBody).toContain(`    comment?: string;`);
  });

  it("übersetzt Schema-Constraints in die 3.6-Decorators", async () => {
    const generation = generateClient(await document);
    const models = generation.files.find((f) => f.path === "models.ts")!.content;
    const orderBody = classBodyOf(models, "OrderDto");
    expect(orderBody).toContain("    @Required()");
    expect(orderBody).toContain("    @EmailAddress()");
    expect(orderBody).toContain('    @RegularExpression("^[A-Z]{3}-\\\\d{4}$")');
    expect(orderBody).toContain("    @StringLength(100, { minimumLength: 5 })");
    expect(orderBody).toContain("    @MinLength(1)");
    expect(orderBody).toContain("    @Range(0, 100)");
    const itemBody = classBodyOf(models, "OrderItemDto");
    expect(itemBody).toContain("    @Range(1, 99)");
    expect(itemBody).toContain("    @MaxLength(60)");
    // Enum-Schema ⇒ Alias-Typ
    expect(models).toContain('export type OrderStatus =\n    | "Pending"\n    | "Paid"\n    | "Shipped"\n    | "Cancelled";');
    // Required-Objekt-Referenz (CreateOrderDto.items ⇒ Array mit Default [])
    const createBody = classBodyOf(models, "CreateOrderDto");
    expect(createBody).toContain("    items: OrderItemDto[] = [];");
  });

  it("klappt allOf-Vererbung zusammen (ASP.NET-Basisklassen)", async () => {
    const generation = generateClient(await document);
    const models = generation.files.find((f) => f.path === "models.ts")!.content;
    const body = classBodyOf(models, "CustomerDetailsDto");
    expect(body).toContain("    id = 0;");
    expect(body).toContain('    displayName = "";');
    expect(body).toContain("    @MinLength(2)");
    expect(body).toContain("    @EmailAddress()");
  });

  it("importiert die Runtime-Decorators nur, wenn sie benutzt werden", async () => {
    const generation = generateClient(await document);
    const models = generation.files.find((f) => f.path === "models.ts")!.content;
    expect(models).toContain('import { EmailAddress, MaxLength, MinLength, Range, RegularExpression, Required, StringLength } from "@tsazor/runtime";');
  });

  it("importiert genau die benutzten Decorators (keine toten Importe)", () => {
    const models = (schemas: Record<string, unknown>): string =>
      generateClient({ openapi: "3.0.1", info: { title: "Bakery", version: "v1" }, paths: {}, components: { schemas } } as OpenApiDocument)
        .files.find((f) => f.path === "models.ts")!.content;
    const subset = models({
      NewOrder: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", maxLength: 40 }, quantity: { type: "integer", minimum: 1, maximum: 10 } },
      },
    });
    expect(subset).toContain('import { MaxLength, Range, Required } from "@tsazor/runtime";');
    expect(subset.startsWith("// GENERATED CODE — do not edit by hand.\n// Source: OpenAPI Bakery v1\n")).toBe(true);
    const none = models({ Note: { type: "object", properties: { text: { type: "string" } } } });
    expect(none).not.toContain("import");
  });
});

describe("generateClient — client", () => {
  it("generiert Operationen mit Pfad-Interpolation, Query-Interface und HttpResult-Typen", async () => {
    const generation = generateClient(await document, { clientName: "ContosoOrders" });
    const clientFile = generation.files.find((f) => f.path === "contoso-orders.ts")!.content;
    expect(clientFile).toContain(`export class ContosoOrdersClient extends OpenApiClient {`);
    expect(clientFile).toContain(`import type { CreateOrderDto, CustomerDetailsDto, OrderDto, OrderStatus } from "./models";`);
    // GET mit Query
    expect(clientFile).toContain(
      `listOrders(query?: ListOrdersQuery): Promise<HttpResult<OrderDto[]>> {`,
    );
    expect(clientFile).toContain(`return this.call("GET", \`/api/orders\${queryString(query)}\`);`);
    // Pfad-Parameter interpoliert
    expect(clientFile).toContain(`getOrder(id: number): Promise<HttpResult<OrderDto>> {`);
    expect(clientFile).toContain(`return this.call("GET", \`/api/orders/\${encodeURIComponent(id)}\`);`);
    // POST mit Body
    expect(clientFile).toContain(`createOrder(body: CreateOrderDto): Promise<HttpResult<OrderDto>> {`);
    expect(clientFile).toContain(`return this.call("POST", \`/api/orders\`, body);`);
    // 204 ohne Schema ⇒ void
    expect(clientFile).toContain(`deleteOrder(id: number): Promise<HttpResult<void>> {`);
    // Query-Interface mit Array-Parameter (type alias — queryString-Contract)
    expect(clientFile).toContain(`export type ListOrdersQuery = {`);
    expect(clientFile).toContain(`    tags?: string[];`);
  });

  it("konstruiert den Envelope im super()-Aufruf und optional den Default-TsazorHttp", async () => {
    const enveloped = generateClient(await document, { clientName: "ContosoOrders", envelope: { data: "data", errors: "errors" } });
    const clientFile = enveloped.files.find((f) => f.path === "contoso-orders.ts")!.content;
    expect(clientFile).toContain(`super(http, { envelope: { data: "data", errors: "errors" } });`);

    const withBase = generateClient(await document, { clientName: "ContosoOrders", baseUrl: "https://api.contoso.example" });
    const baseFile = withBase.files.find((f) => f.path === "contoso-orders.ts")!.content;
    expect(baseFile).toContain(`constructor(http: TsazorHttp = new TsazorHttp({ baseUrl: "https://api.contoso.example" })) {`);
  });

  it("typ-checkt den generierten Output gegen die Paket-Typen (kein TS-Fehler)", async () => {
    // Die generierten Dateien landen für den Check im Dateisystem (echte
    // Modulauflösung, echte tsconfig): test/.out-Scratch mit paths auf den
    // paket-eigenen dist-Typen — exakt die Situation eines Nutzers.
    const generation = generateClient(await document, { clientName: "ContosoOrders", baseUrl: "https://api.contoso.example" });
    const outDir = path.resolve(import.meta.dirname, ".out-generate");
    await mkdir(outDir, { recursive: true });
    for (const file of generation.files) {
      await writeFile(path.join(outDir, file.path), file.content, "utf8");
    }
    await writeFile(
      path.join(outDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: false,
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            types: [],
            noEmit: true,
            // Kein self-link für @tsazor/dotnet in pnpm — Typen direkt auf dist.
            paths: { "@tsazor/dotnet": ["../../dist/index.d.ts"] },
          },
          files: generation.files.map((f) => f.path),
        },
        null,
        2,
      ),
      "utf8",
    );
    const configPath = path.join(outDir, "tsconfig.json");
    const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, outDir);
    expect(parsed.errors, parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n")).toEqual([]);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = ts.getPreEmitDiagnostics(program).filter((entry) => entry.file === undefined || !entry.file.fileName.includes("node_modules"));
    const errors = diagnostics.filter((entry) => entry.category === ts.DiagnosticCategory.Error);
    expect(
      errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"),
      errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"),
    ).toBe("");
    // Warnings: only the documented subset (inline object in the fixture).
    expect(generation.warnings).toEqual([`Schema "metadata": inline object without $ref → Record<string, unknown>`]);
  });
});
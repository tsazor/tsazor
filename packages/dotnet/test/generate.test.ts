/**
 * Generator tests over the checked-in OpenAPI sample (ASP.NET Core style):
 * nullability rules, DataAnnotations decorators from the schema constraints,
 * enum aliases, allOf inheritance, path interpolation, query interfaces and
 * envelope construction — plus a type check of the generated output.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
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
  it("maps nullability according to the four rules", async () => {
    const generation = generateClient(await document, { clientName: "ContosoOrders" });
    const models = generation.files.find((f) => f.path === "models.ts")!.content;
    const orderBody = classBodyOf(models, "OrderDto");
    // required && !nullable ⇒ T (primitive with default)
    expect(orderBody).toContain(`    id = 0;`);
    expect(orderBody).toContain(`    customerName = "";`);
    // required && nullable ⇒ `T | null = null`
    expect(orderBody).toContain(`    note: string | null = null;`);
    // optional && !nullable (CreateOrderDto.comment) ⇒ `?: T`
    const createBody = classBodyOf(models, "CreateOrderDto");
    expect(createBody).toContain(`    comment?: string;`);
  });

  it("translates schema constraints into the 3.6 decorators", async () => {
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
    // enum schema ⇒ alias type
    expect(models).toContain('export type OrderStatus =\n    | "Pending"\n    | "Paid"\n    | "Shipped"\n    | "Cancelled";');
    // required object reference (CreateOrderDto.items ⇒ array with default [])
    const createBody = classBodyOf(models, "CreateOrderDto");
    expect(createBody).toContain("    items: OrderItemDto[] = [];");
  });

  it("flattens allOf inheritance (ASP.NET base classes)", async () => {
    const generation = generateClient(await document);
    const models = generation.files.find((f) => f.path === "models.ts")!.content;
    const body = classBodyOf(models, "CustomerDetailsDto");
    expect(body).toContain("    id = 0;");
    expect(body).toContain('    displayName = "";');
    expect(body).toContain("    @MinLength(2)");
    expect(body).toContain("    @EmailAddress()");
  });

  it("imports the runtime decorators only when they are used", async () => {
    const generation = generateClient(await document);
    const models = generation.files.find((f) => f.path === "models.ts")!.content;
    expect(models).toContain('import { EmailAddress, MaxLength, MinLength, Range, RegularExpression, Required, StringLength } from "@tsazor/runtime";');
  });

  it("imports exactly the decorators used (no dead imports)", () => {
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
  it("generates operations with path interpolation, query interface and HttpResult types", async () => {
    const generation = generateClient(await document, { clientName: "ContosoOrders" });
    const clientFile = generation.files.find((f) => f.path === "contoso-orders.ts")!.content;
    expect(clientFile).toContain(`export class ContosoOrdersClient extends OpenApiClient {`);
    expect(clientFile).toContain(`import type { CreateOrderDto, CustomerDetailsDto, OrderDto, OrderStatus } from "./models";`);
    // GET with query
    expect(clientFile).toContain(
      `listOrders(query?: ListOrdersQuery, options?: RequestOptions): Promise<HttpResult<OrderDto[]>> {`,
    );
    expect(clientFile).toContain(`return this.call("GET", \`/api/orders\${queryString(query)}\`, undefined, options);`);
    // path parameter interpolated
    expect(clientFile).toContain(`getOrder(id: number, options?: RequestOptions): Promise<HttpResult<OrderDto>> {`);
    expect(clientFile).toContain(`return this.call("GET", \`/api/orders/\${encodeURIComponent(id)}\`, undefined, options);`);
    // POST with body
    expect(clientFile).toContain(`createOrder(body: CreateOrderDto, options?: RequestOptions): Promise<HttpResult<OrderDto>> {`);
    expect(clientFile).toContain(`return this.call("POST", \`/api/orders\`, body, options);`);
    // 204 without schema ⇒ void
    expect(clientFile).toContain(`deleteOrder(id: number, options?: RequestOptions): Promise<HttpResult<void>> {`);
    // query interface with array parameter (type alias — queryString contract)
    expect(clientFile).toContain(`export type ListOrdersQuery = {`);
    expect(clientFile).toContain(`    tags?: string[];`);
  });

  it("constructs the envelope in the super() call and optionally the default TsazorHttp", async () => {
    const enveloped = generateClient(await document, { clientName: "ContosoOrders", envelope: { data: "data", errors: "errors" } });
    const clientFile = enveloped.files.find((f) => f.path === "contoso-orders.ts")!.content;
    expect(clientFile).toContain(`super(http, { envelope: { data: "data", errors: "errors" } });`);
    // BlazorHero's Result<T>: `--envelope data,messages,succeeded` (B2).
    const flagged = generateClient(await document, { clientName: "ContosoOrders", envelope: { data: "data", errors: "messages", succeeded: "succeeded" } });
    expect(flagged.files.find((f) => f.path === "contoso-orders.ts")!.content).toContain(
      `super(http, { envelope: { data: "data", errors: "messages", succeeded: "succeeded" } });`,
    );

    const withBase = generateClient(await document, { clientName: "ContosoOrders", baseUrl: "https://api.contoso.example" });
    const baseFile = withBase.files.find((f) => f.path === "contoso-orders.ts")!.content;
    expect(baseFile).toContain(`constructor(http: TsazorHttp = new TsazorHttp({ baseUrl: "https://api.contoso.example" })) {`);
  });

  it("type-checks the generated output against the package types (no TS error)", async () => {
    const generation = generateClient(await document, { clientName: "ContosoOrders", baseUrl: "https://api.contoso.example" });
    expect(await typeErrors(generation.files, "contoso")).toBe("");
    // Warnings: only the documented subset (inline object in the fixture).
    expect(generation.warnings).toEqual([`Schema "metadata": inline object without $ref → Record<string, unknown>`]);
  });

  it("ends every method with the call's options — an AbortSignal, headers of this request (D13)", async () => {
    const clientFile = generateClient(await document, { clientName: "ContosoOrders" }).files.find((f) => f.path === "contoso-orders.ts")!.content;
    const methods = [...clientFile.matchAll(/^ {4}(\w+)\((.*)\): Promise<HttpResult</gm)];
    expect(methods.length).toBeGreaterThan(0);
    for (const [, , parameters] of methods) expect(parameters).toMatch(/(^|, )options\?: RequestOptions$/);
    expect(clientFile).toContain('import { OpenApiClient, queryString, type HttpResult, type RequestOptions } from "@tsazor/dotnet";');
  });
});

describe("generateClient — query arrays", () => {
  it("types an integer[] query parameter so the client passes strict tsc (queryString took string[] only)", async () => {
    const document = {
      openapi: "3.0.1",
      info: { title: "Shop", version: "1" },
      paths: {
        "/api/items": {
          get: {
            operationId: "ListItems",
            parameters: [
              { name: "ids", in: "query", schema: { type: "array", items: { type: "integer", format: "int32" } } },
              { name: "flags", in: "query", schema: { type: "array", items: { type: "boolean" } } },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    } as unknown as OpenApiDocument;
    const generation = generateClient(document, { clientName: "Shop" });
    expect(generation.files.find((f) => f.path === "shop.ts")!.content).toContain("    ids?: number[];");
    expect(await typeErrors(generation.files, "query-arrays")).toBe("");
  });
});

describe("generateClient — path values and parameters outside the signature (D13)", () => {
  const versioned: OpenApiDocument = {
    openapi: "3.0.1",
    info: { title: "Hero", version: "1" },
    paths: {
      "/api/v{version}/Brands": {
        get: {
          parameters: [
            { name: "version", in: "path", required: true, schema: { type: "string" } },
            { name: "X-Tenant", in: "header", schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/v{version}/Brands/{id}": {
        delete: {
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            { name: "version", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  } as unknown as OpenApiDocument;
  const clientOf = (generation: ReturnType<typeof generateClient>) => generation.files.find((f) => f.path === "hero.ts")!.content;

  it("without a value, the version is a parameter of every method and of its name (B4)", () => {
    const client = clientOf(generateClient(versioned, { clientName: "Hero" }));
    expect(client).toContain("getBrands(version: string, options?: RequestOptions)");
  });

  it("writes a fixed path value into the URLs and leaves it out of the signatures and the names", () => {
    const generation = generateClient(versioned, { clientName: "Hero", pathValues: { version: "1" } });
    const client = clientOf(generation);
    expect(client).toContain("getBrands(options?: RequestOptions): Promise<HttpResult<void>> {");
    expect(client).toContain('return this.call("GET", `/api/v1/Brands`, undefined, options);');
    expect(client).toContain("deleteBrands(id: number, options?: RequestOptions)");
    expect(client).toContain('return this.call("DELETE", `/api/v1/Brands/${encodeURIComponent(id)}`, undefined, options);');
    expect(client).not.toContain("version");
  });

  it("warns about a path value no path uses, and about header parameters, with the way to send them", () => {
    const { warnings } = generateClient(versioned, { clientName: "Hero", pathValues: { version: "1", tenant: "a" } });
    expect(warnings).toContain('Path value "tenant": no path has a {tenant} parameter.');
    expect(warnings).toContain(
      "1 header parameter(s) are not in the method signatures (X-Tenant on GET /api/v1/Brands): " +
        "send them with the call's options ({ headers }) or an interceptor of the TsazorHttp.",
    );
  });
});

describe("generateClient — Swashbuckle's defaults (no operationId, an envelope)", () => {
  const defaults: Promise<OpenApiDocument> = loadOpenApiDocument(
    path.join(import.meta.dirname, "fixtures", "openapi-swashbuckle-default.json").replace(/\\/g, "/"),
  );
  const generate = async () =>
    generateClient(await defaults, { clientName: "Cms", envelope: { data: "data", errors: "errors" } });
  const signatures = (client: string) =>
    [...client.matchAll(/^ {4}(\w+)\((.*)\): Promise<HttpResult<(.*)>> \{$/gm)].map(
      (m) => `${m[1]}(${m[2]!.replace(/(, )?options\?: RequestOptions$/, "")}): ${m[3]}`,
    );

  it("derives the method names from the path, without the api/v1 prefix", async () => {
    const client = (await generate()).files.find((f) => f.path === "cms.ts")!.content;
    expect(signatures(client)).toEqual([
      "userGetAll(): UserDto[] | null",
      "userCreate(body: UserCreateRequest): UserDto",
      "userDelete(id: string): boolean",
      // Same name, same method: the path parameter tells them apart.
      "fileDownloadById(id: string): void",
      "fileDownload(query?: FileDownloadQuery): void",
      "fileUpload(body: FileUploadForm, query?: FileUploadQuery): boolean",
      "contentGetAll(contentTypeSlug: string, query?: ContentGetAllQuery): UserDto[] | null",
      // REST style: the method, then the parameter.
      "getOrders(): OrderDto[]",
      "postOrders(body: OrderDto): void",
      "getOrdersById(id: number): OrderDto",
      "deleteOrders(id: number): void",
      "robotsTxt(): string",
    ]);
  });

  it("maps a schema without a type (C#'s object?) to unknown, without a warning", async () => {
    const models = (await generate()).files.find((f) => f.path === "models.ts")!.content;
    expect(classBodyOf(models, "UserDto")).toContain("    data!: Record<string, unknown>;");
  });

  it("reads a response-only model's value types as present, as ASP.NET Core writes them", async () => {
    const models = (await generate()).files.find((f) => f.path === "models.ts")!.content;
    const user = classBodyOf(models, "UserDto");
    // A Guid is always there; a nullable string may be null.
    expect(user).toContain(`    id = "";`);
    expect(user).toContain("    userName?: string | null;");
    // OrderDto is a request body too: the schema's own rules (no required ⇒ optional).
    expect(classBodyOf(models, "OrderDto")).toContain("    id?: number;");
    expect(classBodyOf(models, "UserCreateRequest")).toContain(`    userName = "";`);
  });

  it("says once that the names are derived, with an example and the fix", async () => {
    expect((await generate()).warnings).toEqual([
      "12 operation(s) without operationId: method names derived from the paths (GET /api/User/GetAll → userGetAll). " +
        "For names of your own, set operationIds on the server (Swashbuckle: CustomOperationIds).",
    ]);
  });

  it("sends a multipart/form-data body (file uploads) as FormData, its files as Blobs", async () => {
    const client = (await generate()).files.find((f) => f.path === "cms.ts")!.content;
    expect(client).toContain('import { OpenApiClient, formData, queryString, type HttpResult, type RequestOptions } from "@tsazor/dotnet";');
    expect(client).toContain(
      ["export type FileUploadForm = {", "    files?: Blob[];", "    note: string;", "    cover?: Blob;", "};"].join("\n"),
    );
    expect(client).toContain('return this.call("POST", `/api/File/Upload${queryString(query)}`, formData(body), options);');
    // Without a multipart operation there is nothing to import.
    const json = generateClient(await document, { clientName: "ContosoOrders" }).files.find((f) => f.path === "contoso-orders.ts")!.content;
    expect(json).not.toContain("formData");
  });

  it("types the body as the envelope's data — what the client returns", async () => {
    const plain = generateClient(await defaults, { clientName: "Cms" }).files.find((f) => f.path === "cms.ts")!.content;
    expect(signatures(plain)[0]).toBe("userGetAll(): UserDtoIApiPagingResult");
    expect(await typeErrors((await generate()).files, "swashbuckle")).toBe("");
  });
});

describe("loadOpenApiDocument from a URL", () => {
  it("asks for JSON in a fixed language, not with Node's `accept-language: *` (BlazorHero answers that with a 500)", async () => {
    const asked: Headers[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      asked.push(new Headers(init?.headers));
      return new Response(JSON.stringify({ openapi: "3.0.1", info: { title: "Bakery", version: "v1" }, paths: {} }));
    });
    try {
      expect((await loadOpenApiDocument("http://localhost:5350/swagger/v1/swagger.json")).info?.title).toBe("Bakery");
      expect(asked[0]!.get("accept-language")).toBe("en");
      expect(asked[0]!.get("accept")).toBe("application/json");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * TypeScript errors of generated files. They land on disk (real module
 * resolution, real tsconfig): a test/.out scratch dir with paths to the
 * package's own dist types — exactly a user's situation.
 */
async function typeErrors(files: { path: string; content: string }[], name: string): Promise<string> {
  const outDir = path.resolve(import.meta.dirname, ".out-generate", name);
  await mkdir(outDir, { recursive: true });
  for (const file of files) {
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
          // No self-link for @tsazor/dotnet in pnpm — types point straight at dist.
          paths: { "@tsazor/dotnet": ["../../../dist/index.d.ts"] },
        },
        files: files.map((f) => f.path),
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
  return diagnostics
    .filter((entry) => entry.category === ts.DiagnosticCategory.Error)
    .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
    .join("\n");
}
/**
 * Generator: OpenAPI-Dokument ⇒ zwei TS-Dateien (`models.ts` + `<Client>.ts`).
 *
 * Regeln (dokumentiert im README):
 *  - Nullability: required && !nullable ⇒ `T`; required && nullable ⇒ `T | null`;
 *    optional && !nullable ⇒ `?: T`; optional && nullable ⇒ `?: T | null`.
 *  - `integer`/`number` (auch `int64`) ⇒ `number` — JS hat ein Zahlformat; die
 *    Int64-Präzisionsgrenze wie bei openapi-typescript, im README dokumentiert.
 *  - Modelle sind **Klassen**, damit Instanzen die 3.6-Decorator-Metadaten
 *    tragen und EditContext/DataAnnotationsValidator die Regeln aus dem Schema
 *    finden.
 *  - Schema-Constraints ⇒ DataAnnotations-Decorators (3.6): required (String/
 *    Objekt), minLength/maxLength (beide ⇒ StringLength, sonst einzeln),
 *    minimum/maximum (beide ⇒ Range), pattern, format "email". Abweichung von
 *    .NET: Range nur bei beiden Grenzen (DataAnnotations verlangt zwei).
 *  - Inline-Objekte ohne $ref (und Typen ohne Mapping) → `Record<string,
 *    unknown>`/`unknown` mit Generator-Warnung — die Teilmenge, die Swashbuckle
 *    für DTOs emitted, ist abgedeckt, alles andere bleibt explizit markiert.
 */
import {
  flattenAllOf,
  HTTP_METHODS,
  resolveSchemaLike,
  schemaNullable,
  schemaType,
  type OpenApiDocument,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiSchema,
  type OpenApiMethod,
} from "./openapi.js";
import type { EnvelopeOptions } from "./http-result.js";

export interface GenerateOptions {
  /** Klassenname des Clients (ohne "Client"); Default aus `info.title`. */
  clientName?: string;
  /** CLI `--envelope data,errors`. */
  envelope?: EnvelopeOptions;
  /** CLI `--base-url`: der generierte Client konstruiert per Default einen TsazorHttp darauf. */
  baseUrl?: string;
  /** Dateiname des Clients (ohne .ts); Default aus clientName (kebab-case). */
  clientFile?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface Generation {
  files: GeneratedFile[];
  /** Nicht-mappbare Ausschnitte (dokumentierte Teilmenge) als Warnungen. */
  warnings: string[];
}

export function generateClient(document: OpenApiDocument, options: GenerateOptions = {}): Generation {
  const warnings: string[] = [];
  const clientName = (options.clientName ?? pascal(document.info?.title ?? "Api")).replace(/Client$/, "") || "Api";
  const clientFile = options.clientFile ?? kebab(clientName);
  const gen = new Generator(document, clientName, clientFile, options.envelope, options.baseUrl, warnings);
  return { files: gen.files(), warnings };
}

class Generator {
  /** Modell-Typnamen, die der Client-File braucht (nur während der Client-Phase geschrieben). */
  private readonly clientModelRefs = new Set<string>();
  private tracking = false;

  constructor(
    private readonly document: OpenApiDocument,
    private readonly clientName: string,
    private readonly clientFile: string,
    private readonly envelope: EnvelopeOptions | undefined,
    private readonly baseUrl: string | undefined,
    private readonly warnings: string[],
  ) {}

  files(): GeneratedFile[] {
    return [
      { path: "models.ts", content: this.models() },
      { path: `${this.clientFile}.ts`, content: this.client() },
    ];
  }

  /* Modelle ----------------------------------------------------------------- */

  private models(): string {
    const schemas = this.document.components?.schemas ?? {};
    const body: string[] = [];
    for (const [name, schema] of Object.entries(schemas)) {
      const resolved = resolveSchemaLike(this.document, schema);
      const className = pascal(name);
      if (resolved.enum !== undefined) {
        this.enumAlias(body, className, resolved);
        continue;
      }
      const flat = flattenAllOf(this.document, resolved);
      if (schemaType(flat) !== "object") {
        this.warn(`Schema "${name}" (${schemaType(flat) ?? "unbestimmt"}) ist kein Objekt und kein Enum — übersprungen.`);
        continue;
      }
      this.modelClass(body, className, flat);
    }
    const header: string[] = [
      "// GENERATED CODE — do not edit by hand.",
      `// Source: OpenAPI ${(this.document.info?.title ?? "").trim()} ${(this.document.info?.version ?? "").trim()}`.trimEnd(),
      "",
    ];
    // Import exactly the decorators the models use (no dead imports).
    const decorators = new Set(body.flatMap((line) => /^\s*@(\w+)\(/.exec(line)?.[1] ?? []));
    if (decorators.size > 0) {
      header.push(`import { ${[...decorators].sort().join(", ")} } from "@tsazor/runtime";`, "");
    }
    return [...header, ...body].join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
  }

  private enumAlias(out: string[], name: string, schema: OpenApiSchema): void {
    const doc = docComment("", schema.description);
    if (doc) out.push(doc);
    const literals = schema.enum!.map((value) => (typeof value === "string" ? JSON.stringify(value) : String(value)));
    if (literals.length === 1) {
      out.push(`export type ${name} = ${literals[0]};`);
    } else {
      out.push(`export type ${name} =`);
      literals.forEach((literal, index) => out.push(index === literals.length - 1 ? `    | ${literal};` : `    | ${literal}`));
    }
    out.push("");
  }

  private modelClass(out: string[], className: string, schema: OpenApiSchema): void {
    const doc = docComment("", schema.description);
    if (doc) out.push(doc);
    out.push(`export class ${className} {`);
    const required = new Set(schema.required ?? []);
    const properties = schema.properties ?? {};
    for (const [name, raw] of Object.entries(properties)) {
      // Raw through to typeText: $refs stay $refs (typeText names them), inline
      // objects stay inline objects (warning). Nullable/constraints read the raw form.
      const property = raw as OpenApiSchema;
      for (const decorator of validationDecorators(property, required.has(name))) {
        out.push(`    @${decorator}`);
      }
      const fieldDoc = docComment("    ", property.description);
      if (fieldDoc) out.push(fieldDoc);
      out.push(this.fieldLine(name, property, schemaNullable(property), required.has(name)));
    }
    if (Object.keys(properties).length === 0) out.push("    // (empty schema)");
    out.push("}", "");
  }

  private fieldLine(name: string, property: OpenApiSchema, nullable: boolean, isRequired: boolean): string {
    const key = fieldKey(name);
    const type = this.typeText(property, name);
    if (isRequired && !nullable) {
      // Primitive bekommen den .NET-Default; Objekt-Referenzen definite assignment.
      if (type === "string") return `    ${key} = "";`;
      if (type === "number") return `    ${key} = 0;`;
      if (type === "boolean") return `    ${key} = false;`;
      if (type.endsWith("[]")) return `    ${key}: ${type} = [];`;
      return `    ${key}!: ${type};`;
    }
    if (isRequired && nullable) {
      return `    ${key}: ${type} | null = null;`;
    }
    return `    ${key}?: ${nullable ? `${type} | null` : type};`;
  }

  /** TS-Typ eines Schemas; rekursiv über items/$ref. `withNull`: NullSuffix anfügen
   *  (Felder regeln Nullability selbst — hier nur Items/Query-Positionen). */
  private typeText(property: OpenApiSchema, owner: string, withNull = false): string {
    if (property.$ref !== undefined) {
      const name = pascal(property.$ref.slice(property.$ref.lastIndexOf("/") + 1));
      if (this.tracking) this.clientModelRefs.add(name);
      return name;
    }
    const type = schemaType(property);
    const nullSuffix = withNull && schemaNullable(property) ? " | null" : "";
    switch (type) {
      case "string": {
        const enumType = this.enumText(property);
        return enumType ? `${enumType}${nullSuffix}` : `string${nullSuffix}`;
      }
      case "integer":
      case "number":
        // int32/int64/float/double → number (ein Zahlformat in JS; Präzisionsgrenze im README).
        return `number${nullSuffix}`;
      case "boolean":
        return `boolean${nullSuffix}`;
      case "array": {
        if (property.items === undefined) {
          this.warn(`Schema "${owner}": array ohne items → unknown[]`);
          return "unknown[]";
        }
        // $refs hier NICHT auflösen — typeText benennt den Zieltyp.
        const itemType = this.typeText(property.items as OpenApiSchema, owner, schemaNullable(property.items as OpenApiSchema));
        return `${unionArray(itemType)}${nullSuffix}`;
      }
      case "object": {
        const additional = "additionalProperties" in property ? property.additionalProperties : undefined;
        if (Object.keys(property.properties ?? {}).length === 0 && additional !== undefined) {
          // additionalProperties-Form (ASP.NET: Dictionaries) ohne Propertyverlust.
          const valueType = additional === true || (typeof additional === "object" && Object.keys(additional).length === 0)
            ? "unknown"
            : this.typeText(additional as OpenApiSchema, owner);
          return `Record<string, ${valueType}>${nullSuffix}`;
        }
        this.warn(`Schema "${owner}": inline-Objekt ohne $ref → Record<string, unknown>`);
        return `Record<string, unknown>${nullSuffix}`;
      }
      case undefined:
      default:
        this.warn(`Schema "${owner}": Typ "${type ?? ""}" nicht unterstützt → unknown`);
        return `unknown${nullSuffix}`;
    }
  }

  private enumText(property: OpenApiSchema): string | undefined {
    if (property.enum === undefined || property.enum.length === 0) return undefined;
    return property.enum.map((value) => (typeof value === "string" ? JSON.stringify(value) : String(value))).join(" | ");
  }

  private warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  /* Client ------------------------------------------------------------------ */

  private client(): string {
    this.tracking = true;
    const clientModelRefs = this.clientModelRefs;
    const operations = this.operations();
    this.tracking = false;

    const out: string[] = ["// GENERATED CODE — do not edit by hand.", ""];
    if (clientModelRefs.size > 0) {
      out.push(`import type { ${[...clientModelRefs].sort().join(", ")} } from "./models";`, "");
    }
    // Paket-Importe: Basisklasse + Ergebnis-Typ immer, queryString nur bei
    // Query-Operationen, TsazorHttp als Konstruktor-Typ immer.
    const usesQuery = operations.some((op) => op.queryInterface !== undefined);
    out.push(
      `import { OpenApiClient${usesQuery ? ", queryString" : ""}, type HttpResult } from "@tsazor/dotnet";`,
      'import { TsazorHttp } from "@tsazor/runtime";',
      "",
    );
    for (const op of operations) {
      if (op.queryInterface) out.push(...op.queryInterface, "");
    }
    const httpDefault = this.baseUrl ?? "";
    const defaultArg = httpDefault ? ` = new TsazorHttp({ baseUrl: ${JSON.stringify(httpDefault)} })` : "";
    out.push(`export class ${this.clientName}Client extends OpenApiClient {`);
    out.push(`    constructor(http: TsazorHttp${defaultArg}) {`);
    out.push(`        super(http${this.superArgs()});`, "    }", "");
    for (const op of operations) {
      out.push(...op.lines, "");
    }
    while (out.at(-1) === "") out.pop();
    out.push("}", "");
    return out.join("\n");
  }

  private superArgs(): string {
    if (this.envelope === undefined) return "";
    const parts = [
      this.envelope.data ? `data: ${JSON.stringify(this.envelope.data)}` : "",
      this.envelope.errors ? `errors: ${JSON.stringify(this.envelope.errors)}` : "",
    ].filter((part) => part.length > 0);
    return parts.length === 0 ? "" : `, { envelope: { ${parts.join(", ")} } }`;
  }

  private operations(): OperationGen[] {
    const generated: OperationGen[] = [];
    for (const [path, pathItem] of Object.entries(this.document.paths ?? {})) {
      const item = pathItem as Record<string, unknown>;
      const pathParameters = (Array.isArray(item.parameters) ? item.parameters : []) as (OpenApiParameter | { $ref: string })[];
      for (const method of HTTP_METHODS) {
        const operation = item[method] as OpenApiOperation | undefined;
        if (operation === undefined || operation === null) continue;
        generated.push(this.operation(method as OpenApiMethod, path, operation, pathParameters));
      }
    }
    return generated;
  }

  private operation(
    method: OpenApiMethod,
    path: string,
    operation: OpenApiOperation,
    pathItemParameters: (OpenApiParameter | { $ref: string })[],
  ): OperationGen {
    const parameters = [...pathItemParameters, ...(operation.parameters ?? [])].map(
      (p) => resolveSchemaLike(this.document, p as unknown as OpenApiSchema) as unknown as OpenApiParameter,
    );
    const pathParameters = parameters.filter((p) => p.in === "path");
    const queryParameters = parameters.filter((p) => p.in === "query");

    const name = this.methodName(operation, method, path);
    const responseType = this.responseType(operation, name);
    const bodyType = this.bodyType(operation, name);

    // Signatur: Pfad-Parameter, Body, dann das Query-Objekt.
    const signatureParts = pathParameters.map((p) => `${fieldKey(p.name)}: ${this.typeText(paramSchema(this.document, p), p.name)}`);
    if (bodyType) {
      const request = resolveSchemaLike(this.document, operation.requestBody as unknown as OpenApiSchema) as unknown as { required?: boolean };
      signatureParts.push(`body${request.required === false ? "?" : ""}: ${bodyType.type}`);
    }
    const query = queryParameters.length > 0 ? this.queryEntry(name, queryParameters) : undefined;
    if (query) signatureParts.push(query.signature);

    // URL: Pfad-Template interpoliert, Query-String hinten angehängt.
    let inner = path;
    if (pathParameters.length > 0) {
      inner = path.replace(/\{([^}]+)\}/g, (_m, paramName: string) => "${encodeURIComponent(" + fieldKey(paramName) + ")}");
    }
    if (query) inner += "${queryString(query)}";
    const url = "`" + inner + "`";

    const lines: string[] = [];
    const doc = docComment("    ", operation.summary ?? operation.description);
    if (doc) lines.push(doc);
    lines.push(
      `    ${name}(${signatureParts.join(", ")}): Promise<HttpResult<${responseType?.type ?? "void"}>> {`,
      `        return this.call(${JSON.stringify(method.toUpperCase())}, ${url}${bodyType ? ", body" : ""});`,
      "    }",
    );
    return {
      lines,
      responseType,
      bodyType,
      queryInterface: query?.interface,
    };
  }

  private methodName(operation: OpenApiOperation, method: OpenApiMethod, path: string): string {
    if (operation.operationId) return camel(operation.operationId);
    const segments = path.split("/").filter((s) => s.length > 0 && !/[$()&:]/.test(s)).map(pascal).join("");
    this.warn(`Operation ${method.toUpperCase()} ${path} ohne operationId → Methodenname "${method}${segments}" abgeleitet.`);
    return `${method}${segments}`;
  }

  /** Erste 2xx-Antwort mit JSON-Schema (204 bzw. ohne Schema ⇒ void = undefined body). */
  private responseType(operation: OpenApiOperation, opName: string): { type: string } | undefined {
    if (operation.responses === undefined) return undefined;
    for (const [code, raw] of Object.entries(operation.responses)) {
      if (!/^2\d\d$/.test(code)) continue;
      const response = raw === undefined || raw === null ? undefined : (resolveSchemaLike(this.document, raw as unknown as OpenApiSchema) as unknown as { content?: Record<string, { schema?: OpenApiSchema | { $ref: string } }> });
      const content = response?.content;
      const json = content?.["application/json"] ?? (content ? Object.values(content)[0] : undefined);
      if (json?.schema === undefined) continue;
      return { type: this.typeText(json.schema as OpenApiSchema, opName) };
    }
    return undefined;
  }

  private bodyType(operation: OpenApiOperation, opName: string): { type: string } | undefined {
    const requestBody = operation.requestBody;
    if (requestBody === undefined || requestBody === null) return undefined;
    const content = (resolveSchemaLike(this.document, requestBody as unknown as OpenApiSchema) as unknown as {
      content?: Record<string, { schema?: OpenApiSchema | { $ref: string } }>;
    }).content;
    if (content === undefined) return undefined;
    const json = content["application/json"] ?? Object.values(content)[0];
    if (json?.schema === undefined) return undefined;
    return { type: this.typeText(json.schema as OpenApiSchema, opName) };
  }

  private queryEntry(name: string, parameters: OpenApiParameter[]): OperationQuery {
    const interfaceName = `${name.charAt(0).toUpperCase()}${name.slice(1)}Query`;
    const fields = parameters.map((parameter) => {
      const schema = paramSchema(this.document, parameter);
      const line = `    ${fieldKey(parameter.name)}?: ${this.typeText(schema, parameter.name, schemaNullable(schema))};`;
      const doc = docComment("    ", parameter.description);
      return doc ? [doc, line] : [line];
    });
    return {
      signature: `query?: ${interfaceName}`,
      // type alias statt interface: queryString(Record<…>) verlangt ein
      // implizites Index-Signatur-Target — Interfaces bekommen das nicht.
      interface: [
        docComment("", `Query parameters of the ${name} operation.`),
        `export type ${interfaceName} = {`,
        ...fields.flat(),
        "};",
      ],
    };
  }
}

interface OperationGen {
  lines: string[];
  responseType?: { type: string };
  bodyType?: { type: string };
  queryInterface?: string[];
}

interface OperationQuery {
  signature: string;
  interface: string[];
}

/* Hilfsfunktionen ------------------------------------------------------------ */

/** Parameter-Schema ($ref bleibt $ref — typeText benennt den Zieltyp). */
function paramSchema(_document: OpenApiDocument, parameter: OpenApiParameter): OpenApiSchema {
  return (parameter.schema ?? {}) as OpenApiSchema;
}

/** Union-Elemente in Array-Position klammern: `(A | B)[]`. */
function unionArray(itemType: string): string {
  return /[\s|]/.test(itemType) ? `(${itemType})[]` : `${itemType}[]`;
}

function pascal(name: string): string {
  return name.replace(/[^A-Za-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase());
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase();
}

function camel(name: string): string {
  // "List_Orders" → "listOrders"; PascalCase bleibt erhalten und wird nur
  // klein am Anfang ("ListOrders" → "listOrders").
  const clean = name.replace(/[^A-Za-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase());
  return clean.length === 0 ? "op" : clean.charAt(0).toLowerCase() + clean.slice(1);
}

/** Eigenschaften-Schlüssel als Feld (quoten, wenn kein TS-Identifier). */
function fieldKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function docComment(indent: string, description: string | undefined): string {
  if (description === undefined || description.trim().length === 0) return "";
  return description
    .trim()
    .split("\n")
    .map((line) => `${indent}/** ${line.trim()} */`)
    .join("\n");
}

/** Die DataAnnotations-Decorators (3.6) für ein Schema-Property (fertig als `@X()`). */
function validationDecorators(property: OpenApiSchema, isRequired: boolean): string[] {
  const decorators: string[] = [];
  const type = schemaType(property);
  const isString = type === "string";
  // $ref zählt als Objekt-Referenz (auf ein DTO/Enum).
  const isObjectRef = property.$ref !== undefined || type === "object";
  if (isRequired && !schemaNullable(property) && (isString || isObjectRef)) {
    decorators.push("Required()");
  }
  const { minLength, maxLength, minimum, maximum, pattern, format } = property;
  if (isString && minLength !== undefined && maxLength !== undefined) {
    decorators.push(`StringLength(${maxLength}, { minimumLength: ${minLength} })`);
  } else if (isString && minLength !== undefined) {
    decorators.push(`MinLength(${minLength})`);
  } else if (isString && maxLength !== undefined) {
    decorators.push(`MaxLength(${maxLength})`);
  }
  if (minimum !== undefined && maximum !== undefined) {
    decorators.push(`Range(${minimum}, ${maximum})`);
  }
  if (isString && format === "email") {
    decorators.push("EmailAddress()");
  }
  if (pattern !== undefined) {
    decorators.push(`RegularExpression(${JSON.stringify(pattern)})`);
  }
  return decorators.filter((name) => name.length > 0);
}
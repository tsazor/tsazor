/**
 * Generator: OpenAPI document ⇒ two TS files (`models.ts` + `<Client>.ts`).
 *
 * Rules (documented in the README):
 *  - Nullability: required && !nullable ⇒ `T`; required && nullable ⇒ `T | null`;
 *    optional && !nullable ⇒ `?: T`; optional && nullable ⇒ `?: T | null`.
 *  - `integer`/`number` (`int64` too) ⇒ `number` — JS has one number format; the
 *    Int64 precision limit as in openapi-typescript, documented in the README.
 *  - Models are **classes**, so instances carry the 3.6 decorator metadata
 *    and EditContext/DataAnnotationsValidator find the rules from the schema.
 *  - Schema constraints ⇒ DataAnnotations decorators (3.6): required (string/
 *    object), minLength/maxLength (both ⇒ StringLength, otherwise each alone),
 *    minimum/maximum (both ⇒ Range), pattern, format "email". Deviation from
 *    .NET: Range only with both bounds (DataAnnotations requires two).
 *  - Inline objects without $ref (and types without a mapping) → `Record<string,
 *    unknown>`/`unknown` with a generator warning — the subset Swashbuckle
 *    emits for DTOs is covered, everything else stays explicitly marked.
 */
import {
  flattenAllOf,
  HTTP_METHODS,
  resolveSchemaLike,
  resolveSchemaRef,
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
  /** Class name of the client (without "Client"); default from `info.title`. */
  clientName?: string;
  /** CLI `--envelope data,errors`. */
  envelope?: EnvelopeOptions;
  /** CLI `--base-url`: by default the generated client constructs a TsazorHttp on it. */
  baseUrl?: string;
  /** File name of the client (without .ts); default from clientName (kebab-case). */
  clientFile?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface Generation {
  files: GeneratedFile[];
  /** Unmappable parts (documented subset) as warnings. */
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
  /** Model type names the client file needs (written only during the client phase). */
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

  /* Models ------------------------------------------------------------------ */

  private models(): string {
    const schemas = this.document.components?.schemas ?? {};
    const responseOnly = this.responseOnlySchemas();
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
        this.warn(`Schema "${name}" (${schemaType(flat) ?? "undetermined"}) is neither an object nor an enum — skipped.`);
        continue;
      }
      this.modelClass(body, className, flat, responseOnly.has(name));
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

  /**
   * `responseOnly`: the schema appears only in responses. ASP.NET Core writes every property
   * there (System.Text.Json's default), so a value-typed property that isn't nullable (`Guid`,
   * `int`, `bool`, an enum) is always present — even when Swashbuckle lists no `required`.
   */
  private modelClass(out: string[], className: string, schema: OpenApiSchema, responseOnly: boolean): void {
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
      const present = required.has(name) || (responseOnly && this.isValueType(property));
      out.push(this.fieldLine(name, property, schemaNullable(property), present));
    }
    if (Object.keys(properties).length === 0) out.push("    // (empty schema)");
    out.push("}", "");
  }

  /**
   * True when the property can't be null: it has a type and isn't nullable, or it refers to an
   * enum. A `$ref` to an object can't say whether it is nullable in OpenAPI 3.0, so it doesn't count.
   */
  private isValueType(property: OpenApiSchema): boolean {
    if (property.$ref !== undefined) return resolveSchemaRef(this.document, property.$ref).enum !== undefined;
    return schemaType(property) !== undefined && !schemaNullable(property);
  }

  /** The component schemas that appear in responses and nowhere else (not in a request body or parameter). */
  private responseOnlySchemas(): Set<string> {
    const inResponses = new Set<string>();
    const elsewhere = new Set<string>();
    const visit = (value: unknown, into: Set<string>): void => {
      if (value === null || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item, into);
        return;
      }
      const ref = (value as { $ref?: unknown }).$ref;
      if (typeof ref === "string") {
        const name = ref.slice(ref.lastIndexOf("/") + 1);
        if (into.has(name)) return;
        into.add(name);
        visit(this.document.components?.schemas?.[name], into);
        return;
      }
      for (const child of Object.values(value)) visit(child, into);
    };
    for (const pathItem of Object.values(this.document.paths ?? {})) {
      const item = pathItem as Record<string, unknown>;
      visit(item.parameters, elsewhere);
      for (const method of HTTP_METHODS) {
        const operation = item[method] as OpenApiOperation | undefined;
        if (operation === undefined || operation === null) continue;
        visit(operation.responses, inResponses);
        visit(operation.parameters, elsewhere);
        visit(operation.requestBody, elsewhere);
      }
    }
    return new Set([...inResponses].filter((name) => !elsewhere.has(name)));
  }

  private fieldLine(name: string, property: OpenApiSchema, nullable: boolean, isRequired: boolean): string {
    const key = fieldKey(name);
    const type = this.typeText(property, name);
    if (isRequired && !nullable) {
      // Primitives get the .NET default; object references get definite assignment.
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

  /** TS type of a schema; recursive over items/$ref. `withNull`: append the null suffix
   *  (fields handle nullability themselves — here only item/query positions). */
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
        // int32/int64/float/double → number (one number format in JS; precision limit in the README).
        return `number${nullSuffix}`;
      case "boolean":
        return `boolean${nullSuffix}`;
      case "array": {
        if (property.items === undefined) {
          this.warn(`Schema "${owner}": array without items → unknown[]`);
          return "unknown[]";
        }
        // Do NOT resolve $refs here — typeText names the target type.
        const itemType = this.typeText(property.items as OpenApiSchema, owner, schemaNullable(property.items as OpenApiSchema));
        return `${unionArray(itemType)}${nullSuffix}`;
      }
      case "object": {
        const additional = "additionalProperties" in property ? property.additionalProperties : undefined;
        if (Object.keys(property.properties ?? {}).length === 0 && additional !== undefined) {
          // additionalProperties form (ASP.NET: dictionaries) without losing properties.
          const valueType = additional === true || (typeof additional === "object" && Object.keys(additional).length === 0)
            ? "unknown"
            : this.typeText(additional as OpenApiSchema, owner);
          return `Record<string, ${valueType}>${nullSuffix}`;
        }
        this.warn(`Schema "${owner}": inline object without $ref → Record<string, unknown>`);
        return `Record<string, unknown>${nullSuffix}`;
      }
      case undefined:
      default:
        // A schema without any type keyword is "any value" (`object?` in C#): unknown, as intended.
        if (type === undefined && !ANY_TYPE_KEYWORDS.some((keyword) => keyword in property)) return `unknown${nullSuffix}`;
        this.warn(`Schema "${owner}": type "${type ?? ""}" not supported → unknown`);
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
    // Package imports: base class + result type always, queryString only with
    // query operations, TsazorHttp as the constructor type always.
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
    const entries: OperationEntry[] = [];
    for (const [path, pathItem] of Object.entries(this.document.paths ?? {})) {
      const item = pathItem as Record<string, unknown>;
      const pathItemParameters = (Array.isArray(item.parameters) ? item.parameters : []) as (OpenApiParameter | { $ref: string })[];
      for (const method of HTTP_METHODS) {
        const operation = item[method] as OpenApiOperation | undefined;
        if (operation === undefined || operation === null) continue;
        const parameters = [...pathItemParameters, ...(operation.parameters ?? [])].map(
          (p) => resolveSchemaLike(this.document, p as unknown as OpenApiSchema) as unknown as OpenApiParameter,
        );
        entries.push({ method: method as OpenApiMethod, path, operation, parameters });
      }
    }
    const names = this.methodNames(entries);
    return entries.map((entry, index) => this.operation(entry, names[index]!));
  }

  private operation(entry: OperationEntry, name: string): OperationGen {
    const { method, path, operation, parameters } = entry;
    const pathParameters = parameters.filter((p) => p.in === "path");
    const queryParameters = parameters.filter((p) => p.in === "query");

    const responseType = this.responseType(operation, name);
    const bodyType = this.bodyType(operation, name);

    // Signature: path parameters, body, then the query object.
    const signatureParts = pathParameters.map((p) => `${fieldKey(p.name)}: ${this.typeText(paramSchema(this.document, p), p.name)}`);
    if (bodyType) {
      const request = resolveSchemaLike(this.document, operation.requestBody as unknown as OpenApiSchema) as unknown as { required?: boolean };
      signatureParts.push(`body${request.required === false ? "?" : ""}: ${bodyType.type}`);
    }
    const query = queryParameters.length > 0 ? this.queryEntry(name, queryParameters) : undefined;
    if (query) signatureParts.push(query.signature);

    // URL: path template interpolated, query string appended at the end.
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

  /**
   * One method name per operation: its operationId, or — Swashbuckle's default
   * emits none — a name from the path's literal segments without the `api`/`v1`
   * prefix (`POST /api/User/Create` → `userCreate`). Derived names that collide
   * get the HTTP method (`getOrders`/`postOrders`), then their path parameters
   * (`getOrdersById`), then a counter.
   */
  private methodNames(entries: OperationEntry[]): string[] {
    const derived = entries.map((entry) => !entry.operation.operationId);
    const names = entries.map(
      (entry) => camel(entry.operation.operationId ?? nameSegments(entry.path).join("_")) || entry.method,
    );
    const rename = (stage: (index: number, group: number[]) => string | undefined): void => {
      const groups = new Map<string, number[]>();
      names.forEach((name, index) => groups.set(name, [...(groups.get(name) ?? []), index]));
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        for (const index of group) {
          if (!derived[index]) continue;
          names[index] = stage(index, group) ?? names[index]!;
        }
      }
    };
    rename((index, group) =>
      new Set(group.map((i) => entries[i]!.method)).size > 1 ? camel(`${entries[index]!.method}_${names[index]}`) : undefined,
    );
    rename((index) => {
      const pathParameters = entries[index]!.parameters.filter((p) => p.in === "path").map((p) => upperFirst(camel(p.name)));
      return pathParameters.length > 0 ? `${names[index]}By${pathParameters.join("And")}` : undefined;
    });
    rename((index, group) => {
      const position = group.filter((i) => derived[i]).indexOf(index);
      return position > 0 ? `${names[index]}${position + 1}` : undefined;
    });

    const first = derived.indexOf(true);
    if (first >= 0) {
      const count = derived.filter(Boolean).length;
      const example = `${entries[first]!.method.toUpperCase()} ${entries[first]!.path} → ${names[first]}`;
      this.warn(
        `${count} operation(s) without operationId: method names derived from the paths (${example}). ` +
          "For names of your own, set operationIds on the server (Swashbuckle: CustomOperationIds).",
      );
    }
    return names;
  }

  /**
   * First 2xx response with a JSON schema (204 or no schema ⇒ void = undefined body).
   * With an envelope, the type is the envelope's `data` property: that is what
   * the client returns as `body` (`unwrapEnvelope`).
   */
  private responseType(operation: OpenApiOperation, opName: string): { type: string } | undefined {
    if (operation.responses === undefined) return undefined;
    for (const [code, raw] of Object.entries(operation.responses)) {
      if (!/^2\d\d$/.test(code)) continue;
      const response = raw === undefined || raw === null ? undefined : (resolveSchemaLike(this.document, raw as unknown as OpenApiSchema) as unknown as { content?: Record<string, { schema?: OpenApiSchema | { $ref: string } }> });
      const content = response?.content;
      const json = content?.["application/json"] ?? (content ? Object.values(content)[0] : undefined);
      if (json?.schema === undefined) continue;
      const data = this.envelopeData(json.schema as OpenApiSchema);
      if (data !== undefined) return { type: this.typeText(data, opName, schemaNullable(data)) };
      return { type: this.typeText(json.schema as OpenApiSchema, opName) };
    }
    return undefined;
  }

  /** The schema of the envelope's `data` property, when the response schema is such an envelope. */
  private envelopeData(schema: OpenApiSchema): OpenApiSchema | undefined {
    const key = this.envelope?.data;
    if (key === undefined) return undefined;
    const envelope = flattenAllOf(this.document, resolveSchemaLike(this.document, schema));
    if (schemaType(envelope) !== "object") return undefined;
    return envelope.properties?.[key] as OpenApiSchema | undefined;
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
      // type alias instead of interface: queryString(Record<…>) needs an
      // implicit index-signature target — interfaces don't get one.
      interface: [
        docComment("", `Query parameters of the ${name} operation.`),
        `export type ${interfaceName} = {`,
        ...fields.flat(),
        "};",
      ],
    };
  }
}

interface OperationEntry {
  method: OpenApiMethod;
  path: string;
  operation: OpenApiOperation;
  /** Path-item and operation parameters, resolved. */
  parameters: OpenApiParameter[];
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

/* Helpers -------------------------------------------------------------------- */

/** Parameter schema ($ref stays $ref — typeText names the target type). */
function paramSchema(_document: OpenApiDocument, parameter: OpenApiParameter): OpenApiSchema {
  return (parameter.schema ?? {}) as OpenApiSchema;
}

/** Parenthesize unions in array position: `(A | B)[]`. */
function unionArray(itemType: string): string {
  return /[\s|]/.test(itemType) ? `(${itemType})[]` : `${itemType}[]`;
}

function pascal(name: string): string {
  return name.replace(/[^A-Za-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase());
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase();
}

/** Keywords that give a schema a shape; a schema with none of them accepts any value. */
const ANY_TYPE_KEYWORDS = ["type", "$ref", "properties", "items", "enum", "allOf", "oneOf", "anyOf", "format"];

/** A path's literal segments, without parameters and the conventional `api`/`v1` prefix. */
function nameSegments(path: string): string[] {
  const segments = path.split("/").filter((segment) => segment.length > 0 && !segment.includes("{"));
  while (segments.length > 0 && /^(api|v\d+(\.\d+)?)$/i.test(segments[0]!)) segments.shift();
  return segments;
}

function upperFirst(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function camel(name: string): string {
  // "List_Orders" → "listOrders"; PascalCase is kept and only lowercased
  // at the start ("ListOrders" → "listOrders").
  const clean = name.replace(/[^A-Za-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
  if (clean.length === 0) return "";
  // An identifier cannot start with a digit ("2fa" → "op2fa").
  return /^[0-9]/.test(clean) ? `op${clean}` : clean.charAt(0).toLowerCase() + clean.slice(1);
}

/** Property key as a field (quoted when not a TS identifier). */
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

/** The DataAnnotations decorators (3.6) for a schema property (ready as `@X()`). */
function validationDecorators(property: OpenApiSchema, isRequired: boolean): string[] {
  const decorators: string[] = [];
  const type = schemaType(property);
  const isString = type === "string";
  // $ref counts as an object reference (to a DTO/enum).
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
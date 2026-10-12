/**
 * OpenAPI subset reader for the generator: the document model (3.0 and 3.1)
 * plus $ref resolution. The subset is deliberately small — the pieces an
 * ASP.NET Core backend emits via Swashbuckle/NSwag: paths/operations,
 * request/response bodies, parameters, components.schemas with properties,
 * required, nullable (3.0) / type-includes-"null" (3.1), enum, allOf,
 * additionalProperties and the constraint keywords the validation model
 * maps onto DataAnnotations.
 */

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[] | (OpenApiParameter & { $ref: string })[];
  requestBody?: OpenApiRequestBody | { $ref: string };
  responses?: Record<string, OpenApiResponse | { $ref: string }>;
}

export interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema | { $ref: string };
}

export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: OpenApiSchema | { $ref: string } }>;
}

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchema | { $ref: string } }>;
}

export interface OpenApiSchema {
  /** 3.0: `type` plus `nullable`; 3.1: `type` array including "null". */
  type?: string | string[];
  format?: string;
  nullable?: boolean;
  description?: string;
  properties?: Record<string, OpenApiSchema | { $ref: string }>;
  required?: string[];
  enum?: unknown[];
  items?: OpenApiSchema | { $ref: string };
  allOf?: (OpenApiSchema | { $ref: string })[];
  additionalProperties?: boolean | OpenApiSchema | { $ref: string };
  $ref?: string;
  // Validation constraints (⇒ 3.6 decorators in the generator):
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, OpenApiOperation | "$ref" | unknown>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type OpenApiMethod = (typeof HTTP_METHODS)[number];

/** Loads the document from a file path or URL; JSON only (YAML stays out — the CLI says so). */
export async function loadOpenApiDocument(source: string): Promise<OpenApiDocument> {
  const text = await readSource(source);
  const document = JSON.parse(text) as OpenApiDocument;
  if (typeof document !== "object" || document === null || document.paths === undefined) {
    throw new Error(`[tsazor-dotnet] "${source}" is not an OpenAPI document (paths missing).`);
  }
  return document;
}

async function readSource(source: string): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    // Node's fetch sends `accept-language: *`, which BlazorHero's request-culture middleware answers with a 500
    // (port-blazorhero.md, U1). A fixed language also keeps a localizing server's output the same on every machine.
    const response = await fetch(source, { headers: { accept: "application/json", "accept-language": "en" } });
    if (!response.ok) {
      throw new Error(`[tsazor-dotnet] OpenAPI URL ${source} responded ${response.status} ${response.statusText}.`);
    }
    return response.text();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(source, "utf8");
}

/** Resolves a local `$ref` (`#/components/schemas/Pet`) against the document. */
export function resolveSchemaRef(document: OpenApiDocument, ref: string): OpenApiSchema {
  if (!ref.startsWith("#/")) {
    throw new Error(`[tsazor-dotnet] Only local $refs are supported (${ref}) — remote documents are out of scope.`);
  }
  let node: unknown = document;
  for (const segment of ref.slice(2).split("/")) {
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object" || !(key in (node as object))) {
      throw new Error(`[tsazor-dotnet] $ref "${ref}" cannot be resolved (segment "${key}" missing).`);
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node as OpenApiSchema;
}

/** A property value that may be a schema or a $ref, resolved. */
export function resolveSchemaLike(document: OpenApiDocument, value: OpenApiSchema | { $ref: string }): OpenApiSchema {
  if (typeof value === "object" && "$ref" in value && typeof value.$ref === "string") {
    return resolveSchemaRef(document, value.$ref);
  }
  return value as OpenApiSchema;
}

/**
 * Flattens `allOf` inheritance (ASP.NET Core emits it for base classes):
 * properties and required arrays fold together; each member's own $ref
 * resolves first. On an `allOf` conflict (same property in two members)
 * the first occurrence wins.
 */
export function flattenAllOf(document: OpenApiDocument, schema: OpenApiSchema): OpenApiSchema {
  if (schema.allOf === undefined) return schema;
  const merged: OpenApiSchema = { type: "object", properties: {}, required: [] };
  for (const member of schema.allOf) {
    const resolved = flattenAllOf(document, resolveSchemaLike(document, member));
    for (const [name, property] of Object.entries(resolved.properties ?? {})) {
      if (merged.properties![name] === undefined) merged.properties![name] = property;
    }
    for (const name of resolved.required ?? []) {
      if (!merged.required!.includes(name)) merged.required!.push(name);
    }
  }
  // The allOf node's own constraints/enum/format are kept (e.g. discriminator-free additions).
  if (schema.properties !== undefined) {
    for (const [name, property] of Object.entries(schema.properties)) {
      merged.properties![name] = property;
    }
  }
  if (schema.required !== undefined) {
    for (const name of schema.required) {
      if (!merged.required!.includes(name)) merged.required!.push(name);
    }
  }
  return merged;
}

/** True when the schema allows null (3.0 `nullable: true` or 3.1 "null" type member). */
export function schemaNullable(schema: OpenApiSchema): boolean {
  if (schema.nullable === true) return true;
  return Array.isArray(schema.type) && schema.type.includes("null");
}

/** The non-null primary type name of the schema (3.1 type arrays reduced). */
export function schemaType(schema: OpenApiSchema): string | undefined {
  if (Array.isArray(schema.type)) {
    return schema.type.filter((t) => t !== "null")[0];
  }
  return schema.type !== "null" ? schema.type : undefined;
}
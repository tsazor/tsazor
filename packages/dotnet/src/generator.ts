/**
 * @tsazor/dotnet/generator — der Node-seitige Teil der Brücke: OpenAPI lesen,
 * TS-Client generieren, CLI (`tsazor-dotnet generate`). Zieht node:module
 * an und darf daher nicht über den Browser-Einstieg "." erreichbar sein.
 */
export {
  loadOpenApiDocument,
  resolveSchemaRef,
  resolveSchemaLike,
  flattenAllOf,
  schemaNullable,
  schemaType,
  type OpenApiDocument,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiRequestBody,
  type OpenApiResponse,
  type OpenApiSchema,
  type OpenApiMethod,
} from "./openapi.js";
export { generateClient, type GenerateOptions, type GeneratedFile, type Generation } from "./generate.js";
export { main } from "./cli.js";
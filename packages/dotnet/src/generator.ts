/**
 * @tsazor/dotnet/generator — the Node-side part of the bridge: read OpenAPI,
 * generate the TS client, CLI (`tsazor-dotnet generate`). Pulls in node:
 * modules and so must not be reachable through the browser entry ".".
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
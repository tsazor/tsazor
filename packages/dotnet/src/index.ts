/**
 * @tsazor/dotnet — die offizielle Brücke zu .NET-Backends (Roadmap 5.2):
 *  - OpenAPI ⇒ typisierter TS-Client (lokale Generierung, CLI `tsazor-dotnet`),
 *  - ProblemDetails/Envelope-Fehler als `HttpResult` (niemals ein throw
 *    vor lesbarern Körper),
 *  - Schema-Constraints ⇒ DataAnnotations-Decorators am generierten Modell,
 *  - Auth-Integration (JWT/Cookie) auf `AuthenticationStateProvider`.
 */
export {
  OpenApiClient,
  queryString,
  HTTP_METHOD,
  type OpenApiClientOptions,
  type HttpMethod,
} from "./client.js";
export {
  buildResult,
  asProblemDetails,
  asValidationProblem,
  problemMessage,
  unwrapEnvelope,
  envelopeHasErrors,
  envelopeErrorMessages,
  parseBodyText,
  sendForResult,
  type HttpResult,
  type HttpBody,
  type ProblemDetails,
  type ValidationProblemDetails,
  type EnvelopeOptions,
} from "./http-result.js";
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
export {
  CookieAuthenticationStateProvider,
  JwtAuthenticationStateProvider,
  attachJwtAuth,
  type CookieAuthOptions,
} from "./auth.js";
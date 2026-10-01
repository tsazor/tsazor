/**
 * @tsazor/dotnet — die offizielle Brücke zu .NET-Backends (Roadmap 5.2):
 *  - ProblemDetails/Envelope-Fehler als `HttpResult` (niemals ein throw
 *    vor lesbarern Körper),
 *  - der Basisklient `OpenApiClient` für die generierten Clients,
 *  - Auth-Integration (JWT/Cookie) auf `AuthenticationStateProvider`.
 *
 * Browser-safe: dieser Einstieg zieht KEINE Node-Module (node:fs/fetch) an —
 * die OpenAPI-Generierung lebt hinter dem Untereinstieg `@tsazor/dotnet/generator`.
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
  CookieAuthenticationStateProvider,
  JwtAuthenticationStateProvider,
  attachJwtAuth,
  type CookieAuthOptions,
} from "./auth.js";
/**
 * @tsazor/dotnet — the official bridge to .NET backends (roadmap 5.2):
 *  - ProblemDetails/envelope errors as `HttpResult` (never a throw
 *    before a readable body),
 *  - the base client `OpenApiClient` for the generated clients,
 *  - auth integration (JWT/cookie) on `AuthenticationStateProvider`.
 *
 * Browser-safe: this entry pulls in NO Node modules (node:fs/fetch) —
 * OpenAPI generation lives behind the sub-entry `@tsazor/dotnet/generator`.
 */
export {
  OpenApiClient,
  formData,
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
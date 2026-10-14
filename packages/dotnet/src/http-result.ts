/**
 * Typed results for .NET-backend calls: the request never throws on non-2xx —
 * the failure (ProblemDetails/Envelope) is a value on the result. This is the
 * piece the three app-local bridges each re-invented (review 7.3): TsazorHttp
 * threw before the body was readable, so the app never saw the server's
 * ProblemDetails.
 */
import type { TsazorHttp } from "@tsazor/runtime";

/** RFC 9457 (successor of RFC 7807) ProblemDetails, as ASP.NET Core emits it. */
export interface ProblemDetails {
  /** A URI reference identifying the problem type (defaults to "about:blank"). */
  type?: string;
  /** A short, human-readable summary. */
  title?: string;
  /** The HTTP status code. */
  status?: number;
  /** A human-readable explanation for this occurrence. */
  detail?: string;
  /** The request path (ASP.NET Core extension). */
  instance?: string;
  /** ASP.NET Core's default trace id extension. */
  traceId?: string;
  /** Further extensions the server added (exactly the keys of the JSON object). */
  extensions?: Record<string, unknown>;
}

/**
 * ValidationProblemDetails: a ProblemDetails whose `errors` map field names to
 * messages — what ASP.NET Core returns for ModelState validation failures and
 * what EditContext-forms render in a ValidationSummary.
 */
export interface ValidationProblemDetails extends ProblemDetails {
  /** Field name → its validation messages (ASP.NET Core's `Errors`). */
  errors?: Record<string, string[]>;
}

/** A response body's shape marker: JSON value or unreadable/raw text. */
export type HttpBody = unknown;

/**
 * Result of a typed backend call: `ok` tells a success from an HTTP error status, and an error status is a value, not an
 * exception. A request that gets no response at all — the network is down, the request was aborted — rejects, as
 * `fetch` and .NET's HttpClient do (`TypeError`, `AbortError`).
 */
export type HttpResult<T> =
  | {
      ok: true;
      status: number;
      /** The (envelope-unwrapped) response body as `T`. */
      body: T;
      headers: Headers;
      response: Response;
    }
  | {
      ok: false;
      status: number;
      /** The raw body: parsed JSON when parseable, else the raw text, else undefined. */
      body: unknown;
      /** The RFC 9457 ProblemDetails when the body is one (content type or shape), else null. */
      problem: ProblemDetails | null;
      /** Field errors when the body is a ValidationProblemDetails, else undefined. */
      validationErrors?: Record<string, string[]>;
      headers: Headers;
      response: Response;
    };

/** True when the body is (shaped like) an RFC 9457 ProblemDetails. */
export function asProblemDetails(body: unknown): ProblemDetails | null {
  if (body === null || body === undefined || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  // ASP.NET Core always emits `title`; the RFC only demands `type` (default
  // "about:blank"). Content-type alone is too weak to require here — the
  // shape check keeps a plain JSON error body (`{ message: "…" }`) out.
  const hasType = typeof record.type === "string";
  const hasTitle = typeof record.title === "string";
  const hasStatus = typeof record.status === "number";
  const hasDetail = typeof record.detail === "string";
  const memberCount = [hasType, hasTitle, hasStatus, hasDetail].filter(Boolean).length;
  if (memberCount >= 2 || (memberCount >= 1 && hasStatus)) {
    const problem: ProblemDetails = {};
    if (hasType) problem.type = record.type as string;
    if (hasTitle) problem.title = record.title as string;
    if (hasStatus) problem.status = record.status as number;
    if (hasDetail) problem.detail = record.detail as string;
    if (typeof record.instance === "string") problem.instance = record.instance;
    if (typeof record.traceId === "string") problem.traceId = record.traceId;
    const extensions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!["type", "title", "status", "detail", "instance", "traceId", "errors"].includes(key)) {
        extensions[key] = value;
      }
    }
    if (Object.keys(extensions).length > 0) problem.extensions = extensions;
    return problem;
  }
  return null;
}

/** True when the body additionally carries the `errors` map (ValidationProblemDetails). */
export function asValidationProblem(body: unknown): ValidationProblemDetails | null {
  const problem = asProblemDetails(body);
  if (problem === null || body === null || typeof body !== "object") return null;
  const errors = (body as Record<string, unknown>).errors;
  if (errors === undefined || errors === null || typeof errors !== "object" || Array.isArray(errors)) return null;
  const normalized: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(errors)) {
    normalized[field] = Array.isArray(messages) ? messages.map(String) : [String(messages)];
  }
  return { ...problem, errors: normalized };
}

/** The user-facing message of a failed result: the ProblemDetails `detail`, then `title`, then the status. */
export function problemMessage<T>(result: HttpResult<T>): string {
  if (result.ok) return "";
  if (result.problem?.detail) return result.problem.detail;
  if (result.problem?.title) return result.problem.title;
  return `HTTP ${result.status}`;
}

/* Envelope ------------------------------------------------------------------ */

/**
 * Options describing a response envelope: many .NET APIs wrap every payload as
 * `{ data: T, errors: [...] }` (FluentCMS's style). The `errors` key marks the
 * failure side of the envelope — when present in a 2xx body, the call counts
 * as failed (the server kept the HTTP status clean but signalled errors).
 * An API with a success flag (`{ data, messages, succeeded }`, BlazorHero's
 * Result<T>) names it in `succeeded`: then the flag decides, and the messages
 * of a successful call ("Product Saved") are no failure.
 */
export interface EnvelopeOptions {
  /** The success side of the envelope (e.g. `"data"`); the body is unwrapped from this key. */
  data?: string;
  /** The failure side of the envelope (e.g. `"errors"`, `"messages"`); non-empty ⇒ failure result, unless `succeeded` decides. */
  errors?: string;
  /** The envelope's success flag (e.g. `"succeeded"`): `false` ⇒ failure result (the `errors` side its messages), `true` ⇒ success. */
  succeeded?: string;
}

/**
 * True when the envelope signals a failure in a 2xx body: its success flag is `false`, or — without a flag in the
 * options or the body — its failure side is present and non-empty.
 */
export function envelopeHasErrors(body: unknown, envelope: EnvelopeOptions | undefined): boolean {
  if (body === null || typeof body !== "object") return false;
  if (envelope?.succeeded) {
    const flag = (body as Record<string, unknown>)[envelope.succeeded];
    if (typeof flag === "boolean") return !flag;
  }
  if (!envelope?.errors) return false;
  const errors = (body as Record<string, unknown>)[envelope.errors];
  if (errors === undefined || errors === null) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "string") return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return true;
}

/** Unwraps the envelope's success side (falls back to the raw body without an envelope). */
export function unwrapEnvelope(body: unknown, envelope: EnvelopeOptions | undefined): unknown {
  if (!envelope?.data || body === null || typeof body !== "object") return body;
  const data = (body as Record<string, unknown>)[envelope.data];
  return data === undefined ? body : data;
}

/** The envelope's failure messages, flattened to strings (whatever shape the API uses). */
export function envelopeErrorMessages(body: unknown, envelope: EnvelopeOptions | undefined): string[] {
  if (!envelope?.errors || body === null || typeof body !== "object") return [];
  const errors = (body as Record<string, unknown>)[envelope.errors];
  if (errors === undefined || errors === null) return [];
  return flattenErrors(errors);
}

/** The keys an error object keeps its text under, in order of preference. */
const ERROR_TEXT_KEYS = ["message", "description", "detail", "title", "error"];

function flattenErrors(errors: unknown): string[] {
  if (typeof errors === "string") return errors.length > 0 ? [errors] : [];
  if (Array.isArray(errors)) return errors.flatMap(flattenErrors);
  if (typeof errors === "object" && errors !== null) {
    // An error object (`{ code, description }`, `{ message }`): its text, else its code.
    const record = errors as Record<string, unknown>;
    const text = ERROR_TEXT_KEYS.map((key) => record[key]).find((value) => typeof value === "string" && value.length > 0);
    if (typeof text === "string") return [text];
    if (typeof record["code"] === "string" && record["code"].length > 0) return [record["code"]];
    // `{ field: ["msg"] }` (ValidationProblemDetails style in the envelope) or `{ field: { ...message } }`
    return Object.entries(errors).flatMap(([field, value]) => {
      const messages = flattenErrors(value);
      if (messages.length === 0) return [];
      // A message that repeats the field reads fine twice; otherwise prefix it.
      return messages.map((message) => (message.includes(field) ? message : `${field}: ${message}`));
    });
  }
  return [String(errors)];
}

/* Client plumbing ----------------------------------------------------------- */

/** Parses a response body off text: JSON when parseable, else raw text, else undefined. */
export function parseBodyText(text: string): HttpBody {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Builds the typed result for one `send()` round-trip — the one place the
 * !ok-vs-HttpResult plumbing lives (TsazorHttpError is never involved here:
 * the generated client reads the body itself off the non-throwing `send`).
 */
export function buildResult<T>(
  response: Response,
  text: string,
  envelope: EnvelopeOptions | undefined,
): HttpResult<T> {
  const body = parseBodyText(text);
  const headers = response.headers;
  // Envelope errors fail the call on a 2xx, and carry the message on an error
  // status too (FluentCMS answers 500 with them) — unless a ProblemDetails says more.
  if (envelopeHasErrors(body, envelope) && (response.ok || !hasProblemText(body))) {
    return {
      ok: false,
      status: response.status,
      body,
      problem: asProblemDetails(envelopeErrorMessageBody(body, envelope, response.status)),
      validationErrors: envelopeValidationErrors(body, envelope),
      headers,
      response,
    };
  }
  if (!response.ok) {
    return failureResult(response, body, headers);
  }
  return { ok: true, status: response.status, body: unwrapEnvelope(body, envelope) as T, headers, response };
}

/** True when the body is a ProblemDetails with a text of its own (`title` or `detail`). */
function hasProblemText(body: unknown): boolean {
  const problem = asProblemDetails(body);
  return problem !== null && (problem.title !== undefined || problem.detail !== undefined);
}

function failureResult(response: Response, body: unknown, headers: Headers): HttpResult<never> {
  const validation = asValidationProblem(body);
  return {
    ok: false,
    status: response.status,
    body,
    problem: validation ?? asProblemDetails(body),
    ...(validation?.errors !== undefined ? { validationErrors: validation.errors } : {}),
    headers,
    response,
  };
}

/** A synthetic ProblemDetails for an envelope failure: its messages as the `detail`. */
function envelopeErrorMessageBody(body: unknown, envelope: EnvelopeOptions | undefined, status: number): unknown {
  const messages = envelopeErrorMessages(body, envelope);
  return { type: "about:blank", title: "Request failed (envelope)", status, detail: messages.join("; ") || undefined };
}

function envelopeValidationErrors(body: unknown, envelope: EnvelopeOptions | undefined): Record<string, string[]> | undefined {
  if (!envelope?.errors || body === null || typeof body !== "object") return undefined;
  const errors = (body as Record<string, unknown>)[envelope.errors];
  if (errors === undefined || typeof errors !== "object" || Array.isArray(errors)) return undefined;
  // `{ field: ["msg"] }`-Shaped envelope errors double as validation errors
  // (so ValidationSummary renders them); flat arrays stay plain messages.
  const normalized: Record<string, string[]> = {};
  let isFieldShaped = false;
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      isFieldShaped = true;
      normalized[key] = value.map(String);
    }
  }
  return isFieldShaped ? normalized : undefined;
}

/** Sends through the client's TsazorHttp and builds the typed result. */
export async function sendForResult<T>(
  http: TsazorHttp,
  request: Request,
  envelope: EnvelopeOptions | undefined,
): Promise<HttpResult<T>> {
  const response = await http.send(request);
  const text = await response.text();
  return buildResult<T>(response, text, envelope);
}
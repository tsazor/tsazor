/**
 * OpenApiClient: the base class of the generated client. Builds the typed
 * `HttpResult<T>` from `this.call<T>(method, url, body?)` — never a
 * `throw` on !ok; the error side (ProblemDetails, envelope) is a value on the
 * result. The caller passes the `TsazorHttp` (baseUrl, interceptors,
 * auth headers) like an HttpClient in Blazor.
 */
import { TsazorHttp } from "@tsazor/runtime";
import { sendForResult, type EnvelopeOptions, type HttpResult } from "./http-result.js";

/** The HTTP methods a generated client operation can use. */
export const HTTP_METHOD: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
/** The method argument of `OpenApiClient.call`. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The last argument of every generated method: this call's own settings. The client's `TsazorHttp` interceptors
 * (auth headers, logging) still run.
 */
export interface RequestOptions {
  /** Aborts the request; the call then rejects with an `AbortError`, as `fetch` does. */
  signal?: AbortSignal;
  /** Headers of this request only (an `If-Match`, a header parameter of the operation); they win over the client's. */
  headers?: Record<string, string>;
}

/** Options for a generated client: base URL and envelope unwrapping. */
export interface OpenApiClientOptions {
  /** Base URL for relative paths; by default the TsazorHttp's `baseUrl`. */
  baseUrl?: string;
  /** Envelope unwrapping: `{ data: T, errors: [...] }` response bodies, optionally with a success flag (CLI `--envelope data,errors[,succeeded]`). */
  envelope?: EnvelopeOptions;
}

/**
 * Base class of the clients `tsazor-dotnet` generates from an OpenAPI document.
 * Every operation returns an `HttpResult<T>` and never throws on a non-2xx
 * status; the error body (ProblemDetails, envelope errors) is part of the result.
 */
export abstract class OpenApiClient {
  /** The client requests go through (its interceptors and auth headers apply). */
  protected readonly http: TsazorHttp;
  /** The envelope unwrapping from the options, if any. */
  protected readonly envelope?: EnvelopeOptions;
  private readonly baseUrl?: string;

  /** Takes the `TsazorHttp` to send with, like a typed `HttpClient` in .NET. */
  constructor(http: TsazorHttp, options: OpenApiClientOptions = {}) {
    this.http = http;
    this.baseUrl = options.baseUrl;
    this.envelope = options.envelope;
  }

  /**
   * Runs the operation and reads the body itself (non-throwing). The headers are the TsazorHttp's default headers,
   * the body's content type, then the call's own.
   */
  protected call<T>(method: HttpMethod, url: string, body?: unknown, options?: RequestOptions): Promise<HttpResult<T>> {
    const headers = new Headers({ accept: "application/json", ...this.http.defaultHeaders });
    // A multipart body (file uploads) goes as it is: the browser writes its content type with the boundary.
    const form = body instanceof FormData;
    if (form) headers.delete("content-type");
    else if (body !== undefined) headers.set("content-type", "application/json");
    for (const [name, value] of Object.entries(options?.headers ?? {})) headers.set(name, value);
    const request = new Request(this.resolveUrl(url), {
      method,
      headers,
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
    });
    return sendForResult<T>(this.http, request, this.envelope);
  }

  private resolveUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    const base = (this.baseUrl ?? this.http.baseUrl)?.replace(/\/$/, "") ?? "";
    return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
  }
}

/**
 * A `multipart/form-data` body for the generated methods (an ASP.NET Core `IFormFile` /
 * `IEnumerable<IFormFile>` parameter): a Blob or File keeps its file name, an array appends one
 * part per item, null/undefined is left out, anything else goes as text (an object as JSON).
 */
export function formData(fields: Record<string, unknown>): FormData {
  const form = new FormData();
  const append = (name: string, value: unknown): void => {
    if (value === null || value === undefined) return;
    if (value instanceof Blob) form.append(name, value, value instanceof File ? value.name : "blob");
    else form.append(name, typeof value === "object" ? JSON.stringify(value) : String(value));
  };
  for (const [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const item of value) append(name, item);
    else append(name, value);
  }
  return form;
}

/**
 * Query-string helper for the generated methods: null/undefined skips
 * the parameter, arrays are sent as repeated keys (ASP.NET Core:
 * `?tag=a&tag=b`). Returns `"?a=1"` or `""` (nothing appended).
 */
export function queryString(params: Record<string, string | number | boolean | string[] | null | undefined> | undefined): string {
  if (params === undefined) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const text = search.toString();
  return text.length > 0 ? `?${text}` : "";
}
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
export const HTTP_METHOD = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
/** One of `HTTP_METHOD`: the method argument of `OpenApiClient.call`. */
export type HttpMethod = (typeof HTTP_METHOD)[number];

/** Options for a generated client: base URL and envelope unwrapping. */
export interface OpenApiClientOptions {
  /** Base URL for relative paths (otherwise the TsazorHttp resolves them). */
  baseUrl?: string;
  /** Envelope unwrapping: `{ data: T, errors: [...] }` response bodies (CLI `--envelope data,errors`). */
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

  /** Runs the operation and reads the body itself (non-throwing). */
  protected call<T>(method: HttpMethod, url: string, body?: unknown): Promise<HttpResult<T>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const request = new Request(this.resolveUrl(url), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return sendForResult<T>(this.http, request, this.envelope);
  }

  private resolveUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    const base = this.baseUrl?.replace(/\/$/, "") ?? "";
    return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
  }
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
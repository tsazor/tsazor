/**
 * OpenApiClient: die Basisklasse des generierten Clients. Baut aus
 * `this.call<T>(method, url, body?)` das typed `HttpResult<T>` — niemals ein
 * `throw` bei !ok; die Fehlerseite (ProblemDetails, Envelope) ist Wert auf dem
 * Resultat. Der Aufrufer übergibt den `TsazorHttp` (baseUrl, Interceptors,
 * Auth-Header) wie einen HttpClient in Blazor.
 */
import { TsazorHttp } from "@tsazor/runtime";
import { sendForResult, type EnvelopeOptions, type HttpResult } from "./http-result.js";

export const HTTP_METHOD = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHOD)[number];

export interface OpenApiClientOptions {
  /** Basis-URL für relative Pfade (sonst löst der TsazorHttp auf). */
  baseUrl?: string;
  /** Envelope-Entpackung: `{ data: T, errors: [...] }`-Antwortkörper (CLI `--envelope data,errors`). */
  envelope?: EnvelopeOptions;
}

export abstract class OpenApiClient {
  protected readonly http: TsazorHttp;
  protected readonly envelope?: EnvelopeOptions;
  private readonly baseUrl?: string;

  constructor(http: TsazorHttp, options: OpenApiClientOptions = {}) {
    this.http = http;
    this.baseUrl = options.baseUrl;
    this.envelope = options.envelope;
  }

  /** Führt die Operation aus und liest den Körper selbst (nicht-throwing). */
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
 * Query-String-Hilfe für die generierten Methoden: null/undefined überspringt
 * den Parameter, Arrays werden als wiederholte Schlüssel (ASP.NET-Core:
 * `?tag=a&tag=b`) gesendet. Gibt `"?a=1"` oder `""` (nichts angehängt) zurück.
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
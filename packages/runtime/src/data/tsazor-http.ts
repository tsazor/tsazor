/**
 * TsazorHttp: fetch-based HTTP client for @inject-ed data access, mirroring
 * Blazor's HttpClient usage patterns (GetFromJsonAsync / PostAsJsonAsync) as
 * getJson/postJson. Supports interceptor chains for requests and responses
 * (auth headers, error mapping, …).
 */

export interface TsazorHttpOptions {
  /** Prepended to relative URLs (no trailing slash). */
  baseUrl?: string;
  /** Sent with every request unless overridden. */
  defaultHeaders?: Record<string, string>;
  /**
   * Sends the request instead of the global `fetch` — like the
   * HttpMessageHandler of a .NET HttpClient: an in-memory backend for tests
   * and demos, or a wrapper around `fetch`. Interceptors still run around it.
   */
  fetch?: (request: Request) => Promise<Response>;
}

/** Transforms (or replaces) the outgoing request. */
export type RequestInterceptor = (request: Request) => Request | Promise<Request>;
/** Transforms (or replaces) the response before JSON parsing. */
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

/**
 * Error thrown by the getJson/postJson/putJson/deleteJson helpers on non-2xx
 * responses. Carries the parsed body (JSON object when parseable, raw text
 * otherwise) so ProblemDetails/Envelope payloads stay readable — 5.2: the
 * bridge's `HttpResult` builds on this instead of losing the body.
 */
export class TsazorHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  /** Parsed JSON body when possible, else the raw body text, else null. */
  readonly body: unknown;
  /** The failing response (body may already be consumed). */
  readonly response: Response;

  constructor(response: Response, body: unknown) {
    const summary = typeof body === "string" ? body : body === null ? "<no body>" : JSON.stringify(body);
    super(`[tsazor-http] ${response.status} ${response.statusText}: ${summary}`);
    this.name = "TsazorHttpError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = body;
    this.response = response;
  }
}

export class TsazorHttp {
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];

  constructor(private readonly options: TsazorHttpOptions = {}) {}

  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index >= 0) this.requestInterceptors.splice(index, 1);
    };
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index >= 0) this.responseInterceptors.splice(index, 1);
    };
  }

  /** Builds and sends a Request through the interceptor chain. */
  async send(request: Request): Promise<Response> {
    let current = request;
    for (const interceptor of this.requestInterceptors) {
      current = await interceptor(current);
    }
    let response = await (this.options.fetch ?? fetch)(current);
    for (const interceptor of this.responseInterceptors) {
      response = await interceptor(response);
    }
    return response;
  }

  async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.send(new Request(this.resolve(url), { method: "GET", headers: this.headers(), ...init }));
    return (await this.parse(response)) as T;
  }

  async postJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
    const response = await this.send(
      new Request(this.resolve(url), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        ...init,
      }),
    );
    return (await this.parse(response)) as T;
  }

  async putJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
    const response = await this.send(
      new Request(this.resolve(url), {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify(body),
        ...init,
      }),
    );
    return (await this.parse(response)) as T;
  }

  async deleteJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.send(new Request(this.resolve(url), { method: "DELETE", headers: this.headers(), ...init }));
    return (await this.parse(response)) as T;
  }

  private resolve(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    const base = this.options.baseUrl?.replace(/\/$/, "") ?? "";
    return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", ...(this.options.defaultHeaders ?? {}) };
  }

  private async parse(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new TsazorHttpError(response, await safeBody(response));
    }
    const text = await response.text();
    return text.length === 0 ? null : JSON.parse(text);
  }
}

/** Reads the error body: parsed JSON when parseable, raw text otherwise, null when unreadable. */
async function safeBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (text.length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}
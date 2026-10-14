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
/**
 * Transforms (or replaces) the response before JSON parsing. `request` is the one that was sent (after the request
 * interceptors), as a .NET `DelegatingHandler` sees both.
 */
export type ResponseInterceptor = (response: Response, request: Request) => Response | Promise<Response>;

/**
 * Error thrown by the getJson/postJson/putJson/deleteJson helpers on non-2xx
 * responses. Carries the parsed body (JSON object when parseable, raw text
 * otherwise) so ProblemDetails/Envelope payloads stay readable — 5.2: the
 * bridge's `HttpResult` builds on this instead of losing the body.
 */
export class TsazorHttpError extends Error {
  /** The HTTP status code, e.g. `404`. */
  readonly status: number;
  /** The HTTP status text, e.g. `"Not Found"`. */
  readonly statusText: string;
  /** Parsed JSON body when possible, else the raw body text, else null. */
  readonly body: unknown;
  /** The failing response (body may already be consumed). */
  readonly response: Response;

  /** Builds the error from the failing response and its already-read body. */
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

/**
 * Fetch-based JSON HTTP client, Tsazor's counterpart of Blazor's injected
 * `HttpClient` with `GetFromJsonAsync` / `PostAsJsonAsync`. Register an
 * instance in DI and `@inject` it; non-2xx responses throw `TsazorHttpError`.
 */
export class TsazorHttp {
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];

  /** Creates a client with an optional base URL, default headers and `fetch` replacement. */
  constructor(private readonly options: TsazorHttpOptions = {}) {}

  /** The URL relative request URLs resolve against (HttpClient's `BaseAddress`); a typed client built on this one uses it. */
  get baseUrl(): string | undefined {
    return this.options.baseUrl;
  }

  /** The headers every request carries unless it sets its own (HttpClient's `DefaultRequestHeaders`). */
  get defaultHeaders(): Readonly<Record<string, string>> {
    return this.options.defaultHeaders ?? {};
  }

  /**
   * Adds an interceptor that runs on every outgoing request, in the order
   * added (e.g. to set an auth header). Returns a function that removes it.
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index >= 0) this.requestInterceptors.splice(index, 1);
    };
  }

  /**
   * Adds an interceptor that runs on every response before the status check
   * and JSON parsing; it gets the request that was sent too. The one added
   * last runs first, as .NET's handler chain unwinds (the handler added last
   * is the innermost): an interceptor added after one that throws on an error
   * status still sees that response. Returns a function that removes it.
   */
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
    for (const interceptor of [...this.responseInterceptors].reverse()) {
      response = await interceptor(response, current);
    }
    return response;
  }

  /**
   * Sends a GET and parses the JSON response (Blazor's `GetFromJsonAsync`).
   * An empty body yields `null`; a non-2xx status throws `TsazorHttpError`.
   */
  async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.send(new Request(this.resolve(url), { method: "GET", headers: this.headers(), ...init }));
    return (await this.parse(response)) as T;
  }

  /**
   * Sends `body` as JSON with POST and parses the JSON response (Blazor's
   * `PostAsJsonAsync` + `ReadFromJsonAsync`). Empty body → `null`; non-2xx throws `TsazorHttpError`.
   */
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

  /**
   * Sends `body` as JSON with PUT and parses the JSON response (Blazor's
   * `PutAsJsonAsync`). Empty body → `null`; non-2xx throws `TsazorHttpError`.
   */
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

  /**
   * Sends a DELETE and parses the JSON response (Blazor's `DeleteAsync`).
   * Empty body → `null`; non-2xx throws `TsazorHttpError`.
   */
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
/**
 * TasorHttp: fetch-based HTTP client for @inject-ed data access, mirroring
 * Blazor's HttpClient usage patterns (GetFromJsonAsync / PostAsJsonAsync) as
 * getJson/postJson. Supports interceptor chains for requests and responses
 * (auth headers, error mapping, …).
 */

export interface TasorHttpOptions {
  /** Prepended to relative URLs (no trailing slash). */
  baseUrl?: string;
  /** Sent with every request unless overridden. */
  defaultHeaders?: Record<string, string>;
}

/** Transforms (or replaces) the outgoing request. */
export type RequestInterceptor = (request: Request) => Request | Promise<Request>;
/** Transforms (or replaces) the response before JSON parsing. */
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

export class TasorHttp {
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];

  constructor(private readonly options: TasorHttpOptions = {}) {}

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
    let response = await fetch(current);
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
      throw new Error(`[tasor-http] ${response.status} ${response.statusText}: ${await safeText(response)}`);
    }
    const text = await response.text();
    return text.length === 0 ? null : JSON.parse(text);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable body>";
  }
}
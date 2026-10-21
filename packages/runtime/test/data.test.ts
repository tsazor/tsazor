/**
 * M6 acceptance tests: Data — TsazorHttp (getJson/postJson + interceptors).
 * Virtualize has its own file: virtualize.test.ts (Blazor's unit tests, ported).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TsazorHttp, TsazorHttpError } from "../src/index";

/* TsazorHttp ------------------------------------------------------------- */

describe("TsazorHttp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("performs getJson with baseUrl resolution and parses the response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 7, name: "Tsazor" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const http = new TsazorHttp({ baseUrl: "https://api.example.com/v1" });
    const result = await http.getJson<{ id: number; name: string }>("/items/7");

    expect(result).toEqual({ id: 7, name: "Tsazor" });
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.url).toBe("https://api.example.com/v1/items/7");
    expect(request.method).toBe("GET");
    expect(request.headers.get("content-type")).toBe("application/json");
  });

  it("getString returns the body as text and throws on an error status", async () => {
    const fetchMock = vi.fn(async (request: Request) =>
      request.url.endsWith("/export") ? new Response("UEsDBBQ=", { status: 200, headers: { "content-type": "text/plain" } }) : new Response("gone", { status: 410 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const http = new TsazorHttp({ baseUrl: "https://api.example.com" });
    expect(await http.getString("api/users/export")).toBe("UEsDBBQ=");
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect([request.method, request.url]).toEqual(["GET", "https://api.example.com/api/users/export"]);
    const error = await http.getString("api/users/old").catch((e: TsazorHttpError) => e);
    expect(error).toBeInstanceOf(TsazorHttpError);
    expect([error.status, error.body]).toEqual([410, "gone"]);
  });

  it("posts JSON bodies", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ created: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const http = new TsazorHttp();
    const result = await http.postJson<{ created: boolean }>("/items", { name: "x" });

    expect(result).toEqual({ created: true });
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(await request.json()).toEqual({ name: "x" });
  });

  it("runs request and response interceptors in order", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([1, 2]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const http = new TsazorHttp();
    const seenAuth: string[] = [];
    http.addRequestInterceptor((request) => {
      return new Request(request, { headers: { authorization: "Bearer t1" } });
    });
    http.addRequestInterceptor((request) => {
      seenAuth.push(request.headers.get("authorization")!);
      return request;
    });
    const answered: string[] = [];
    http.addResponseInterceptor((response, request) => {
      answered.push(request.headers.get("authorization")!);
      return new Response(response.body, { status: response.status, headers: { "x-touched": "yes" } });
    });

    const result = await http.getJson<number[]>("/numbers");
    expect(result).toEqual([1, 2]);
    expect(seenAuth).toEqual(["Bearer t1"]);
    // A response interceptor sees the request that was sent, after the request interceptors.
    expect(answered).toEqual(["Bearer t1"]);
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.headers.get("authorization")).toBe("Bearer t1");
  });

  it("unwinds response interceptors like .NET's handler chain: the one added last sees the response first", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    const http = new TsazorHttp();
    const order: string[] = [];
    http.addRequestInterceptor((request) => {
      order.push("request: outer");
      return request;
    });
    http.addRequestInterceptor((request) => {
      order.push("request: inner");
      return request;
    });
    // The outer one maps error statuses to exceptions, as an app's envelope handling does.
    http.addResponseInterceptor((response) => {
      order.push("response: outer");
      if (!response.ok) throw new Error(`mapped ${response.status}`);
      return response;
    });
    http.addResponseInterceptor((response) => {
      order.push(`response: inner saw ${response.status}`);
      return response;
    });

    await expect(http.getJson("/orders")).rejects.toThrow("mapped 401");
    expect(order).toEqual(["request: outer", "request: inner", "response: inner saw 401", "response: outer"]);
  });

  it("sends through the fetch option instead of the global fetch (HttpClient's handler)", async () => {
    const globalFetch = vi.fn(async () => new Response("global"));
    vi.stubGlobal("fetch", globalFetch);
    const seen: string[] = [];
    const http = new TsazorHttp({
      baseUrl: "https://bakery.example",
      fetch: async (request) => {
        seen.push(`${request.method} ${request.url} ${request.headers.get("authorization")}`);
        return new Response(JSON.stringify(["rye"]), { status: 200 });
      },
    });
    http.addRequestInterceptor((request) => new Request(request, { headers: { authorization: "Bearer t" } }));

    expect(await http.getJson<string[]>("/api/breads")).toEqual(["rye"]);
    expect(seen).toEqual(["GET https://bakery.example/api/breads Bearer t"]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("throws TsazorHttpError with status and readable body on error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ title: "Not found", status: 404 }), { status: 404 })),
    );
    const http = new TsazorHttp();
    const error = await http.getJson("/missing").catch((e: TsazorHttpError) => e);
    expect(error).toBeInstanceOf(TsazorHttpError);
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ title: "Not found", status: 404 });
    expect(error.message).toContain("[tsazor-http] 404");
  });

  it("falls back to raw body text when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const http = new TsazorHttp();
    const error = await http.getJson("/missing").catch((e: TsazorHttpError) => e);
    expect(error.body).toBe("not found");
  });

  it("keeps send() non-throwing on error responses (result plumbing for @tsazor/dotnet)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const http = new TsazorHttp();
    const response = await http.send(new Request("https://api.example.com/x"));
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("boom");
  });
});

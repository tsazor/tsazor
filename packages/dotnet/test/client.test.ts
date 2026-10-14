/**
 * End-to-end over a real Node HTTP server (5.2 requirement: testable without
 * .NET): the client reads ProblemDetails/ValidationProblemDetails as a value
 * on the HttpResult — never a throw before a readable body — and unwraps
 * the FluentCMS envelope. The client here is a hand-written OpenApiClient
 * subclass (the generated form is checked in generate.test.ts; the runtime
 * plumbing is the same `call`/`sendForResult` route).
 *
 * @vitest-environment node — node:http + node-fetch (happy-dom's fetch does
 * not reach the loopback interface here).
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpenApiClient, formData, type RequestOptions } from "../src/index.js";
import { asProblemDetails, buildResult, envelopeHasErrors, problemMessage, type EnvelopeOptions, type HttpResult } from "../src/http-result.js";
import { TsazorHttp } from "@tsazor/runtime";

interface OrderDto {
  id: number;
  customerName: string;
  note?: string | null;
}

let server: Server;
let baseUrl = "";
let requests = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    requests++;
    const url = request.url ?? "";
    response.setHeader("content-type", "application/json");
    if (url === "/api/upload") {
      // Echoes what arrived: the content type and the raw multipart body.
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => response.end(JSON.stringify({ contentType: request.headers["content-type"], body: Buffer.concat(chunks).toString("utf8") })));
    } else if (url === "/api/orders/1") {
      response.end(JSON.stringify({ id: 1, customerName: "Ada", note: null }));
    } else if (url === "/api/orders/404") {
      response.statusCode = 404;
      response.setHeader("content-type", "application/problem+json");
      response.end(
        JSON.stringify({
          type: "https://tools.ietf.org/html/rfc9110#section-15.5.5",
          title: "Not found",
          status: 404,
          detail: "Order 404 does not exist.",
          traceId: "00-abc",
        }),
      );
    } else if (url === "/api/orders" && request.method === "POST") {
      response.statusCode = 400;
      response.setHeader("content-type", "application/problem+json");
      response.end(
        JSON.stringify({
          title: "One or more validation errors occurred.",
          status: 400,
          traceId: "00-def",
          errors: { customerName: ["The customerName field is required."], "items[0]": ["Quantity must be between 1 and 99."] },
        }),
      );
    } else if (url === "/api/plain-error") {
      // Not ProblemDetails: just a JSON {message} body.
      response.statusCode = 500;
      response.end(JSON.stringify({ message: "boom" }));
    } else if (url === "/api/text-error") {
      // Raw text body (proxy/legacy).
      response.statusCode = 502;
      response.setHeader("content-type", "text/plain");
      response.end("Bad Gateway");
    } else if (url === `/envelope/orders/ok`) {
      response.end(JSON.stringify({ data: { id: 7, customerName: "Grace" }, errors: [] }));
    } else if (url === `/envelope/orders/failure`) {
      response.end(JSON.stringify({ data: null, errors: ["Order could not be persisted."] }));
    } else if (url === `/envelope/orders/validation`) {
      response.end(JSON.stringify({ data: null, errors: { customerName: ["The customerName field is required."] } }));
    } else if (url === `/envelope/orders/server-error`) {
      // FluentCMS: an error status with the envelope, its errors as { code, description }.
      response.statusCode = 500;
      response.end(JSON.stringify({ errors: [{ code: "Order.Locked", description: "" }, { code: "Order.Late", description: "Too late to change." }], status: 500, data: null, isSuccess: false }));
    } else {
      response.statusCode = 500;
      response.end(JSON.stringify({ title: "Unknown route" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

class DemoClient extends OpenApiClient {
  getOrder(id: number): Promise<HttpResult<OrderDto>> {
    return this.call<OrderDto>("GET", `/api/orders/${encodeURIComponent(id)}`);
  }
  createOrder(body: Partial<OrderDto>) {
    return this.call<OrderDto>("POST", "/api/orders", body);
  }
  plainError() {
    return this.call<never>("GET", "/api/plain-error");
  }
  textError() {
    return this.call<never>("GET", "/api/text-error");
  }
}

class UploadClient extends OpenApiClient {
  upload(body: { files?: Blob[]; note: string; skipped?: string | null }) {
    return this.call<{ contentType: string; body: string }>("POST", "/api/upload", formData(body));
  }
}

class EnvelopeClient extends OpenApiClient {
  get(id: number) {
    return this.call<{ id: number }>("GET", `/envelope/orders/${id > 0 ? "ok" : "failure"}`);
  }
  validation() {
    return this.call<{ id: number }>("GET", "/envelope/orders/validation");
  }
  serverError() {
    return this.call<{ id: number }>("GET", "/envelope/orders/server-error");
  }
}

describe("OpenApiClient over a Node HTTP server", () => {
  it("returns ok:true with the parsed body on 2xx", async () => {
    const client = new DemoClient(new TsazorHttp(), { baseUrl });
    const result = await client.getOrder(1);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ id: 1, customerName: "Ada", note: null });
  });

  it("returns ProblemDetails as a value on 404 (application/problem+json)", async () => {
    const client = new DemoClient(new TsazorHttp(), { baseUrl });
    const result = await client.getOrder(404);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.problem).not.toBeNull();
    expect(result.problem!.title).toBe("Not found");
    expect(result.problem!.detail).toBe("Order 404 does not exist.");
    expect(result.problem!.traceId).toBe("00-abc");
    expect(result.problem!.status).toBe(404);
    expect(problemMessage(result)).toBe("Order 404 does not exist.");
  });

  it("returns ValidationProblemDetails with the field errors on 400", async () => {
    const client = new DemoClient(new TsazorHttp(), { baseUrl });
    await expect(
      (async () => {
        const result = await client.createOrder({});
        expect(result.ok).toBe(false);
        expect(result.problem!.title).toContain("validation errors");
        expect(result.validationErrors).toEqual({
          customerName: ["The customerName field is required."],
          "items[0]": ["Quantity must be between 1 and 99."],
        });
      })(),
    ).resolves.toBeUndefined();
  });

  it("treats non-ProblemDetails bodies as raw body values", async () => {
    const client = new DemoClient(new TsazorHttp(), { baseUrl });
    const plain = await client.plainError();
    expect(plain.ok).toBe(false);
    expect(plain.problem).toBeNull(); // { message: "boom" } is not an RFC 9457 body
    expect(plain.body).toEqual({ message: "boom" });

    const text = await client.textError();
    expect(text.ok).toBe(false);
    expect(text.problem).toBeNull();
    expect(text.body).toBe("Bad Gateway");
    expect(problemMessage(text)).toBe("HTTP 502");
  });

  it("unwraps the envelope as ok:true and marks envelope errors as ok:false", async () => {
    const envelope: EnvelopeOptions = { data: "data", errors: "errors" };
    const client = new EnvelopeClient(new TsazorHttp(), { baseUrl, envelope });
    const ok = await client.get(1);
    expect(ok.ok).toBe(true);
    expect(ok.body).toEqual({ id: 7, customerName: "Grace" });

    const failed = await client.get(0);
    expect(failed.ok).toBe(false);
    expect(failed.problem!.detail).toBe("Order could not be persisted.");

    const validation = await client.validation();
    expect(validation.ok).toBe(false);
    expect(validation.validationErrors).toEqual({ customerName: ["The customerName field is required."] });

    expect(envelopeHasErrors({ data: null, errors: [] }, envelope)).toBe(false);
    expect(asProblemDetails({ title: "x", status: 500 })?.title).toBe("x");
  });

  it("lets the envelope's success flag decide: messages on a success are no failure (BlazorHero's Result<T>, B2)", () => {
    const envelope: EnvelopeOptions = { data: "data", errors: "messages", succeeded: "succeeded" };
    const result = (body: unknown) => buildResult<number>(new Response(null, { status: 200 }), JSON.stringify(body), envelope);
    const saved = result({ data: 7, messages: ["Product Saved"], succeeded: true });
    expect(saved.ok && saved.body).toBe(7);
    const refused = result({ data: 0, messages: ["Brand not found"], succeeded: false });
    expect(refused.ok).toBe(false);
    expect(problemMessage(refused)).toBe("Brand not found");
    // A body without the flag: its messages decide, as without the option.
    expect(envelopeHasErrors({ data: 1, messages: ["Failed"] }, envelope)).toBe(true);
    // Without the option, messages fail even a call that says it succeeded (FluentCMS's style).
    expect(envelopeHasErrors({ data: 1, messages: ["Saved"], succeeded: true }, { data: "data", errors: "messages" })).toBe(true);
  });

  it("reads the envelope's errors on an error status, each error object by its text or code", async () => {
    const client = new EnvelopeClient(new TsazorHttp(), { baseUrl, envelope: { data: "data", errors: "errors" } });
    const failed = await client.serverError();
    expect(failed.ok).toBe(false);
    expect(failed.status).toBe(500);
    expect(problemMessage(failed)).toBe("Order.Locked; Too late to change.");
  });
});

describe("multipart/form-data (file uploads)", () => {
  it("sends FormData with the browser's multipart content type, one part per file", async () => {
    const client = new UploadClient(new TsazorHttp(), { baseUrl });
    const result = await client.upload({
      files: [new File(["alpha"], "a.txt", { type: "text/plain" }), new Blob(["beta"])],
      note: "two files",
      skipped: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not application/json: the multipart type with its boundary.
    expect(result.body.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const body = result.body.body;
    expect(body).toContain('name="files"; filename="a.txt"');
    expect(body).toContain('name="files"; filename="blob"');
    expect(body).toContain("alpha");
    expect(body).toContain('name="note"');
    expect(body).toContain("two files");
    // null/undefined fields are left out, as ASP.NET Core would bind them as missing anyway.
    expect(body).not.toContain("skipped");
  });

  it("appends an array once per item and writes an object as JSON", () => {
    const form = formData({ tags: ["a", "b"], meta: { size: 2 }, count: 3, flag: false });
    expect(form.getAll("tags")).toEqual(["a", "b"]);
    expect(form.get("meta")).toBe('{"size":2}');
    expect(form.get("count")).toBe("3");
    expect(form.get("flag")).toBe("false");
  });
});

describe("the call's options (D13)", () => {
  class OptionsClient extends OpenApiClient {
    getOrder(id: number, options?: RequestOptions) {
      return this.call<OrderDto>("GET", `/api/orders/${id}`, undefined, options);
    }
  }
  const json = () => new Response("{}", { headers: { "content-type": "application/json" } });

  it("sends this call's headers over the client's, with its AbortSignal", async () => {
    let sent: Request | undefined;
    const http = new TsazorHttp({ fetch: async (request) => ((sent = request as Request), json()) });
    const controller = new AbortController();
    await new OptionsClient(http, { baseUrl: "http://orders.test" }).getOrder(1, { signal: controller.signal, headers: { "if-match": '"v2"', accept: "application/problem+json" } });
    expect(sent!.headers.get("if-match")).toBe('"v2"');
    expect(sent!.headers.get("accept")).toBe("application/problem+json");
    controller.abort();
    expect(sent!.signal.aborted).toBe(true);
  });

  it("resolves against the TsazorHttp's base URL and sends its default headers (what --base-url generates)", async () => {
    let sent: Request | undefined;
    const http = new TsazorHttp({
      baseUrl: "https://orders.test/",
      defaultHeaders: { "x-app": "shop", accept: "application/vnd.shop+json" },
      fetch: async (request) => ((sent = request as Request), json()),
    });
    await new OptionsClient(http).getOrder(1, { headers: { "x-app": "admin" } });
    expect(sent!.url).toBe("https://orders.test/api/orders/1");
    expect(sent!.headers.get("accept")).toBe("application/vnd.shop+json");
    expect(sent!.headers.get("x-app")).toBe("admin");
    // The client's own baseUrl option still wins.
    await new OptionsClient(http, { baseUrl: "https://other.test" }).getOrder(2);
    expect(sent!.url).toBe("https://other.test/api/orders/2");
  });

  it("rejects with an AbortError when the call is aborted, as fetch does", async () => {
    const http = new TsazorHttp({
      fetch: (request) =>
        new Promise<Response>((_resolve, reject) => {
          (request as Request).signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    });
    const controller = new AbortController();
    const pending = new OptionsClient(http, { baseUrl: "http://orders.test" }).getOrder(1, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

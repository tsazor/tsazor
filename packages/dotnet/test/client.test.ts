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
import { OpenApiClient } from "../src/index.js";
import { asProblemDetails, envelopeHasErrors, problemMessage, type EnvelopeOptions, type HttpResult } from "../src/http-result.js";
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
    if (url === "/api/orders/1") {
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

class EnvelopeClient extends OpenApiClient {
  get(id: number) {
    return this.call<{ id: number }>("GET", `/envelope/orders/${id > 0 ? "ok" : "failure"}`);
  }
  validation() {
    return this.call<{ id: number }>("GET", "/envelope/orders/validation");
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
});
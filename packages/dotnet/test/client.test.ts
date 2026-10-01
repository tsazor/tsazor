/**
 * End-to-End über einen echten Node-HTTP-Server (5.2-Forderung: ohne .NET
 * testbar): der Client liest ProblemDetails/ValidationProblemDetails als Wert
 * auf dem HttpResult — niemals ein throw vor lesbarern Körper — und entpackt
 * den FluentCMS-Envelope. Der Client ist hier eine handgeschriebene
 * OpenApiClient-Unterklage (die generierte Form wird in generate.test.ts
 * geprüft; die Laufzeit-Plumbing ist dieselbe `call`/`sendForResult`-Route).
 *
 * @vitest-environment node — node:http + node-fetch (happy-dom-Fetch reicht
 * hier nicht an die Loopback-Schnittstelle).
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
          detail: "Bestellung 404 existiert nicht.",
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
      // Kein ProblemDetails: nur ein JSON-{message}-Körper.
      response.statusCode = 500;
      response.end(JSON.stringify({ message: "boom" }));
    } else if (url === "/api/text-error") {
      // Rohtext-Körper (Proxy/legacy).
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

describe("OpenApiClient über einen Node-HTTP-Server", () => {
  it("liefert ok:true mit gelesenen Körper bei 2xx", async () => {
    const client = new DemoClient(new TsazorHttp(), { baseUrl });
    const result = await client.getOrder(1);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ id: 1, customerName: "Ada", note: null });
  });

  it("liefert ProblemDetails als Wert bei 404 (application/problem+json)", async () => {
    const client = new DemoClient(new TsazorHttp(), { baseUrl });
    const result = await client.getOrder(404);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.problem).not.toBeNull();
    expect(result.problem!.title).toBe("Not found");
    expect(result.problem!.detail).toBe("Bestellung 404 existiert nicht.");
    expect(result.problem!.traceId).toBe("00-abc");
    expect(result.problem!.status).toBe(404);
    expect(problemMessage(result)).toBe("Bestellung 404 existiert nicht.");
  });

  it("liefert ValidationProblemDetails mit den Feld-Fehlern bei 400", async () => {
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

  it("behandelt Nicht-ProblemDetails-Körper als rohe body-Werte", async () => {
    const client = new DemoClient(new TsazorHttp(), { baseUrl });
    const plain = await client.plainError();
    expect(plain.ok).toBe(false);
    expect(plain.problem).toBeNull(); // { message: "boom" } ist kein RFC-9457-Körper
    expect(plain.body).toEqual({ message: "boom" });

    const text = await client.textError();
    expect(text.ok).toBe(false);
    expect(text.problem).toBeNull();
    expect(text.body).toBe("Bad Gateway");
    expect(problemMessage(text)).toBe("HTTP 502");
  });

  it("entpackt den Envelope ok:true und markiert Envelope-Fehler als ok:false", async () => {
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
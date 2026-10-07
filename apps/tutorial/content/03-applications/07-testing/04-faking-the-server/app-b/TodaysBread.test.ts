import { describe, expect, it, vi } from "vitest";
import { render, TsazorHttp, type ServiceCollection } from "@tsazor/testing";
import TodaysBread from "./TodaysBread.tsazor";

/** Registers an HTTP client whose requests the fake answers. */
const server = (fetch: (request: Request) => Promise<Response>) => (services: ServiceCollection) =>
    services.registerValue(TsazorHttp, new TsazorHttp({ baseUrl: "https://bakery.example", fetch }));

describe("TodaysBread", () => {
    it("lists today's breads", async () => {
        const fetch = vi.fn(async (_request: Request) => new Response(JSON.stringify(["rye", "sourdough"])));
        const page = await render(TodaysBread, { services: server(fetch) });
        expect(page.findAll(".breads li").map((item) => item.textContent)).toEqual(["rye", "sourdough"]);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0].url).toBe("https://bakery.example/api/breads");
    });

    it("says so when the server fails", async () => {
        const fetch = vi.fn(async (_request: Request) => new Response("", { status: 503 }));
        const page = await render(TodaysBread, { services: server(fetch) });
        expect(page.find(".problem").textContent).toBe("The bakery's server didn't answer (503).");
    });
});

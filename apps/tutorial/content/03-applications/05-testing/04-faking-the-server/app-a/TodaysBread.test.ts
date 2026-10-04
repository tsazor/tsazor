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
    });
});

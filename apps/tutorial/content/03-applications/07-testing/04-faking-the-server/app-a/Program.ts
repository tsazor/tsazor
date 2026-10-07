import { createTsazorApp, TsazorHttp } from "@tsazor/runtime";
import App from "./App.tsazor";

// The bakery's server, played in memory (the preview has no real one).
const bakeryApi = async (_request: Request) =>
    new Response(JSON.stringify(["sourdough", "rye", "ciabatta"]), { status: 200 });

createTsazorApp({
    root: App,
    services: (services) => services.registerValue(TsazorHttp, new TsazorHttp({ baseUrl: "https://bakery.example", fetch: bakeryApi })),
});

import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";

createTsazorApp({ root: App, routing: { mode: "hash" } });

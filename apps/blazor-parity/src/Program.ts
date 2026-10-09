import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import { exposeTestHooks } from "./test-hooks";

exposeTestHooks();

createTsazorApp({
  root: App,
  routes,
  // Blazor's test host swaps the mounted test component at once; holding the previous page would delay that.
  routing: { holdPreviousPage: false },
});

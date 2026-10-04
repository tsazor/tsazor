import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";

// The entry point of every Tsazor app: index.html loads this file, and
// createTsazorApp mounts the root component into <div id="app">.
createTsazorApp({ root: App });

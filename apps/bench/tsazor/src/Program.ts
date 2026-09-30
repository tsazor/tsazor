import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import "../../bench.css";

createTsazorApp({ root: App, routes });
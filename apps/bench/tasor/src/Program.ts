import { createTasorApp } from "@tasor/runtime";
import App from "./App.tazor";
import routes from "virtual:tasor-routes";
import "../../bench.css";

createTasorApp({ root: App, routes });
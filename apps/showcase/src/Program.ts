import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import "bootstrap/dist/css/bootstrap.min.css";
import "@tsazor/bootstrap/tsazor-bootstrap.css";
import "./app.css";

createTsazorApp({ root: App, routes });
import { createTsazorApp } from "@tsazor/runtime";
import RouterApp from "./RouterApp.tsazor";
import routes from "virtual:tsazor-routes";
import "../../bench.css";

// `vite build --mode router`: the bench with Tsazor's Router in hash mode (#/todo, #/rows), as the JS apps' URLs.
createTsazorApp({ root: RouterApp, routes, routing: { mode: "hash" } });

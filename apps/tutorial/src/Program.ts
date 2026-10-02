import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import { TutorialState } from "./TutorialState";
import "./app.css";

createTsazorApp({
  root: App,
  routes,
  services: (services) => {
    services.registerValue(TutorialState, new TutorialState());
  },
});

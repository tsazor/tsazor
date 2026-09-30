declare module "*.tsazor" {
  import type { ComponentBase } from "@tsazor/runtime";
  const component: abstract new (...args: never[]) => ComponentBase;
  export default component;
}

declare module "virtual:tsazor-routes" {
  import type { RouteEntry } from "@tsazor/runtime";
  const routes: RouteEntry[];
  export default routes;
}
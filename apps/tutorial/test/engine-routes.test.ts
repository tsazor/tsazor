/**
 * buildProject's route manifest: one RouteRequest per @page template — the
 * in-browser counterpart of a real app's `virtual:tsazor-routes` module.
 */
import { describe, expect, it } from "vitest";
import { buildProject } from "../src/engine/compile-project";

describe("buildProject route manifest", () => {
  it("collects one request per @page template, in source order", () => {
    const build = buildProject({
      "App.tsazor": "<p>app</p>",
      "Pages/Home.tsazor": '@page "/"\n@page "/home"\n<p>Home</p>',
      "Pages/Order.tsazor": '@page "/orders/{Id:int}"\n<p>Order</p>',
    });
    expect(build.routes).toEqual([
      { template: "/", module: "$app/Pages/Home.tsazor" },
      { template: "/home", module: "$app/Pages/Home.tsazor" },
      { template: "/orders/{Id:int}", module: "$app/Pages/Order.tsazor" },
    ]);
  });

  it("resolves a @layout to its module and carries @authorize requirements", () => {
    const build = buildProject({
      "App.tsazor": "<p>app</p>",
      "MainLayout.tsazor": "<main>@Body</main>",
      "Admin.tsazor": '@page "/admin"\n@layout MainLayout\n@authorize({ roles: ["admin"] })\n<p>Admin</p>',
      "Public.tsazor": '@page "/public"\n<p>Public</p>',
    });
    expect(build.routes).toContainEqual({
      template: "/admin",
      module: "$app/Admin.tsazor",
      layout: "$app/MainLayout.tsazor",
      authorize: { roles: ["admin"] },
    });
    expect(build.routes).toContainEqual({ template: "/public", module: "$app/Public.tsazor" });
  });

  it("has no routes without @page files", () => {
    expect(buildProject({ "App.tsazor": "<p>app</p>" }).routes).toEqual([]);
  });
});
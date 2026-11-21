/**
 * B12: the route manifest merges the _Imports chain's @authorize into each page's requirements, as Blazor applies
 * an _Imports.razor's `@attribute [Authorize]` to every page below it; `@allowAnonymous` opts a page (or a folder)
 * out, as `[AllowAnonymous]`.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanRoutes } from "../src/routes";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-routes-authorize-"));
  const src = path.join(root, "src");
  await mkdir(path.join(src, "Pages", "Account"), { recursive: true });
  await writeFile(path.join(src, "_Imports.tsazor"), "@authorize\n");
  await writeFile(path.join(src, "Pages", "Home.tsazor"), '@page "/"\n<p>home</p>\n');
  await writeFile(path.join(src, "Pages", "Brands.tsazor"), '@page "/brands"\n@authorize({ policy: "Brands.View" })\n<p>brands</p>\n');
  await writeFile(path.join(src, "Pages", "Login.tsazor"), '@page "/login"\n@allowAnonymous\n<p>login</p>\n');
  await writeFile(path.join(src, "Pages", "Account", "_Imports.tsazor"), "@allowAnonymous\n");
  await writeFile(path.join(src, "Pages", "Account", "Register.tsazor"), '@page "/register"\n<p>register</p>\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the route manifest and the _Imports chain's @authorize (B12)", () => {
  it("protects every page below it, ANDs a page's own, and leaves @allowAnonymous pages and folders public", async () => {
    const routes = await scanRoutes(root);
    const byTemplate = Object.fromEntries(routes.map((route) => [route.template, [route.authorize, route.authorizeRequirements]]));
    expect(byTemplate).toEqual({
      "/": [true, undefined],
      "/brands": [true, { policy: "Brands.View" }],
      "/login": [false, undefined],
      "/register": [false, undefined],
    });
  });
});

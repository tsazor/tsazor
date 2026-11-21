/**
 * Features an app only bundles when it uses them (R5, bundle size): the
 * localization services are defaults their own modules register, the document
 * head is mounted once PageTitle/HeadContent provide the outlet, and the
 * renderer's error-boundary check does not import the ErrorBoundary components.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CultureService, ServiceCollection, StringLocalizer } from "../src/index";
import { LocalizationSettings } from "../src/di/service-defaults";
import { provideHeadOutlet, whenHeadOutlet } from "../src/head/head-support";

describe("localization services as defaults", () => {
  it("resolve without a registration, as singletons of the root", () => {
    const services = new ServiceCollection().build();
    const culture = services.get(CultureService);
    expect(culture.current.name).toBe("");
    expect(services.get(CultureService)).toBe(culture);
    expect(services.createScope().get(CultureService)).toBe(culture);
    const localizer = services.get(StringLocalizer);
    expect(localizer.get("Hello")).toBe("Hello");
  });

  it("take the app's localization settings", () => {
    const collection = new ServiceCollection();
    collection.registerValue(LocalizationSettings, new LocalizationSettings("de-DE", { "de-DE": { Hello: "Hallo" } }));
    const services = collection.build();
    expect(services.get(CultureService).current.name).toBe("de-DE");
    expect(services.get(StringLocalizer).get("Hello")).toBe("Hallo");
  });

  it("an explicit registration wins", () => {
    const own = new CultureService("fr-FR");
    const collection = new ServiceCollection();
    collection.registerValue(CultureService, own);
    expect(collection.build().get(CultureService)).toBe(own);
  });
});

describe("document head on demand", () => {
  it("mounts waiting apps when the outlet is provided, later ones at once", () => {
    // The test process may have provided it already (PageTitle is in the index); the contract
    // holds either way: every waiter runs exactly once with the outlet.
    const seen: unknown[] = [];
    const stop = whenHeadOutlet((outlet) => seen.push(outlet));
    const Outlet = class {};
    provideHeadOutlet(Outlet);
    expect(seen).toHaveLength(1);
    stop();
    const later: unknown[] = [];
    whenHeadOutlet((outlet) => later.push(outlet));
    expect(later).toEqual([seen[0]]);
  });

  it("PageTitle and HeadContent provide the outlet; the app does not import it", () => {
    const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
    const read = (file: string): string => readFileSync(path.join(src, file), "utf8");
    expect(read("routing/page-title.ts")).toContain("provideHeadOutlet(HeadOutlet)");
    expect(read("head/head-content.ts")).toContain("provideHeadOutlet(HeadOutlet)");
    expect(read("app.ts")).not.toContain("./head/head-outlet.js");
    // Value imports only (an `import type` is erased).
    expect(read("app.ts")).not.toMatch(/^import \{[^}]*\} from "\.\/localization\//m);
    expect(read("renderer/renderer.ts")).toContain("error-boundary-contract.js");
  });
});

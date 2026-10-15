/**
 * P.10: disposing an app disposes its service provider, as Blazor's host does — after the component tree, the
 * services it created last first; a `registerValue` constant stays with its owner.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, createTsazorApp, inject, type RenderTreeBuilder } from "../src/index";
import { rendererOf } from "../src/internal";

const log: string[] = [];

class Clock {
  dispose(): void {
    log.push("Clock");
  }
}

class Feed {
  readonly clock = inject(Clock);
  dispose(): void {
    log.push("Feed");
  }
}

class Shared {
  dispose(): void {
    log.push("Shared");
  }
}

class Page extends ComponentBase {
  readonly feed = inject(Feed);
  protected override buildRenderTree(builder: RenderTreeBuilder): void {
    builder.addContent(0, "page");
  }
  dispose(): void {
    log.push("Page");
  }
}

afterEach(() => {
  document.body.innerHTML = "";
  log.length = 0;
});

describe("createTsazorApp().dispose()", () => {
  it("disposes the components, then the services the provider created (last first), not a constant", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const shared = new Shared();
    const app = createTsazorApp({
      root: Page,
      services: (services) => {
        services.registerType(Clock);
        services.registerType(Feed);
        services.registerValue(Shared, shared);
      },
    });
    await rendererOf(app).waitUntilIdle();
    expect(document.querySelector("#app")!.textContent).toBe("page");
    app.dispose();
    expect(log).toEqual(["Page", "Feed", "Clock"]);
    expect(() => app.services.get(Clock)).toThrow(/disposed/);
    app.dispose();
    expect(log).toEqual(["Page", "Feed", "Clock"]);
  });
});

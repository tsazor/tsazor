import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { CascadingParameter, ComponentBase, RenderTreeBuilder } from "@tsazor/runtime";
import { FluentProvider } from "../dist/index.js";

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Awaited<ReturnType<typeof renderTree>>["renderer"]): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

/** A descendant that reads the provider's cascade by name. */
class ThemeReader extends ComponentBase {
  @CascadingParameter({ name: "FluentTheme" }) themeInfo?: { theme: string };
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "div");
    b.addContent(1, `theme=${this.themeInfo?.theme ?? "none"}`);
    b.closeElement();
  }
}

describe("FluentProvider", () => {
  it("renders the wrapper with the theme attribute", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, FluentProvider);
      b.addAttribute(1, "theme", "dark");
      b.closeComponent();
    });
    const provider = container.querySelector(".fui-provider")!;
    expect(provider).toBeTruthy();
    expect(provider.getAttribute("data-fluent-theme")).toBe("dark");
  });

  it("follows the system by default (Fluent UI Blazor's DesignThemeModes.System)", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, FluentProvider);
      b.closeComponent();
    });
    expect(container.querySelector(".fui-provider")!.getAttribute("data-fluent-theme")).toBe("system");
  });

  it("renders token overrides as inline custom properties", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, FluentProvider);
      b.addAttribute(1, "tokenOverrides", { "--fui-accent": "#E3008C" });
      b.closeComponent();
    });
    const provider = container.querySelector(".fui-provider")!;
    expect(provider.getAttribute("style")).toContain("--fui-accent: #E3008C");
  });

  it("cascades the theme by name to descendants", async () => {
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, FluentProvider);
      b.addAttribute(1, "theme", "dark");
      b.addAttribute(2, "childContent", (inner: RenderTreeBuilder) => {
        inner.openComponent(0, ThemeReader);
        inner.closeComponent();
      });
      b.closeComponent();
    });
    await settle(renderer);
    const reader = container.querySelector("div")!;
    expect(reader.textContent).toBe("theme=dark");
  });
});
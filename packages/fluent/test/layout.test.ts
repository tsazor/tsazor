/**
 * Layout primitives (Stack, Grid, Spacer) + Typography: render smoke tests
 * against the token-driven class/inline-style contracts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import type { RenderTreeBuilder } from "@tsazor/runtime";
import { Stack, Grid, Spacer, Typography } from "../dist/index.js";

/** Waits out the microtask render queue plus the settle timer. */
async function settle(result: RenderResult): Promise<void> {
  await result.renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await result.renderer.waitUntilIdle();
}

/** Renders a component class with string params into a fresh container. */
async function renderOne(component: unknown, attrs: (b: RenderTreeBuilder) => void): Promise<RenderResult> {
  const result = await renderTree((b) => {
    b.openComponent(0, component as never);
    attrs(b);
    b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Child"));
    b.closeComponent();
  });
  await settle(result);
  return result;
}

afterAll(() => {
  document.body.innerHTML = "";
});

describe("Stack", () => {
  it("renders a horizontal flex container by default", async () => {
    const result = await renderOne(Stack, (b) => b.addAttribute(1, "gap", "m"));
    const el = result.container.querySelector(".fui-stack")!;
    expect(el.className).toContain("fui-stack fui-stack--horizontal");
    expect(el.getAttribute("style")).toContain("gap: var(--fui-spacing-m)");
    expect(el.textContent).toContain("Child");
    result.dispose();
  });

  it("flips to vertical with wrap on request", async () => {
    const result = await renderOne(Stack, (b) => {
      b.addAttribute(1, "direction", "vertical");
      b.addAttribute(2, "wrap", true);
    });
    expect(result.container.querySelector(".fui-stack")!.className).toContain(
      "fui-stack fui-stack--vertical fui-stack--wrap",
    );
    result.dispose();
  });
});

describe("Grid", () => {
  it("emits a fixed repeat(columns) track from the columns prop", async () => {
    const result = await renderOne(Grid, (b) => b.addAttribute(1, "columns", 4));
    const el = result.container.querySelector(".fui-grid")!;
    expect(el.getAttribute("style")).toContain("repeat(4, 1fr)");
    expect(el.className).toContain("fui-grid");
    result.dispose();
  });

  it("switches to responsive minmax tracks when minChildWidth is set", async () => {
    const result = await renderOne(Grid, (b) => {
      b.addAttribute(1, "columns", 3);
      b.addAttribute(2, "minChildWidth", "240px");
      b.addAttribute(3, "gap", "m");
    });
    const el = result.container.querySelector(".fui-grid")!;
    expect(el.getAttribute("style")).toContain("repeat(auto-fill, minmax(240px, 1fr))");
    expect(el.getAttribute("style")).toContain("gap: var(--fui-spacing-m)");
    result.dispose();
  });
});

describe("Spacer", () => {
  it("fixes the height from the token spacing scale by default", async () => {
    const result = await renderOne(Spacer, (b) => b.addAttribute(1, "size", "l"));
    expect(result.container.querySelector(".fui-spacer")!.getAttribute("style")).toContain(
      "height: var(--fui-spacing-l)",
    );
    result.dispose();
  });

  it("fixes the width instead on the horizontal direction", async () => {
    const result = await renderOne(Spacer, (b) => {
      b.addAttribute(1, "direction", "horizontal");
      b.addAttribute(2, "size", "xl");
    });
    expect(result.container.querySelector(".fui-spacer")!.getAttribute("style")).toContain(
      "width: var(--fui-spacing-xl)",
    );
    result.dispose();
  });
});

describe("Typography", () => {
  it("maps variants to semantic elements and token classes", async () => {
    const result = await renderOne(Typography, (b) => b.addAttribute(1, "variant", "h3"));
    const h3 = result.container.querySelector("h3")!;
    expect(h3.className).toContain("fui-typography fui-typography--h3");
    expect(h3.textContent).toContain("Child");
    result.dispose();
  });

  it("renders body and caption variants with weight overrides", async () => {
    const body = await renderOne(Typography, (b) => {
      b.addAttribute(1, "variant", "body");
      b.addAttribute(2, "weight", "semibold");
    });
    const p = body.container.querySelector("p")!;
    expect(p.className).toContain("fui-typography fui-typography--body");
    expect(p.getAttribute("style")).toContain("font-weight: var(--fui-font-weight-semibold)");

    const caption = await renderOne(Typography, (b) => b.addAttribute(1, "variant", "caption"));
    expect(caption.container.querySelector("span")!.className).toContain("fui-typography--caption");
    body.dispose();
    caption.dispose();
  });
});
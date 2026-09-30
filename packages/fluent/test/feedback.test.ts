/**
 * Icon, Indicator, Alert, Breadcrumb + Pagination: render semantics,
 * severity mapping, dismiss interaction and the controlled paging callback.
 */
import { afterAll, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import {
  Icon,
  Indicator,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Pagination,
} from "../dist/index.js";

/** Waits out the microtask render queue plus the settle timer. */
async function settle(result: RenderResult): Promise<void> {
  await result.renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await result.renderer.waitUntilIdle();
}

/** Renders a component with param attributes plus an optional child slot. */
async function renderOne(
  component: unknown,
  attrs?: (b: RenderTreeBuilder) => void,
): Promise<RenderResult> {
  const result = await renderTree((b) => {
    b.openComponent(0, component as never);
    if (attrs) attrs(b);
    b.closeComponent();
  });
  await settle(result);
  return result;
}

/** Clicks a button like a real user event (bubbling pointer event). */
function click(container: Element, selector: string): void {
  container.querySelector(selector)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

afterAll(() => {
  document.body.innerHTML = "";
});

describe("Icon", () => {
  it("renders the named inline path hidden from assistive tech", async () => {
    const result = await renderOne(Icon, (b) => {
      b.addAttribute(1, "name", "chevron-right");
      b.addAttribute(2, "size", 20);
    });
    const svg = result.container.querySelector(".fui-icon")!;
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("height")).toBe("20");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("path")!.getAttribute("d")).toBe("M8 3l7 7-7 7");
    result.dispose();
  });

  it("exposes role=img with an accessible label when one is given", async () => {
    const result = await renderOne(Icon, (b) => {
      b.addAttribute(1, "name", "check");
      b.addAttribute(2, "ariaLabel", "Completed");
    });
    const svg = result.container.querySelector(".fui-icon")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Completed");
    expect(svg.getAttribute("aria-hidden")).toBe("false");
    result.dispose();
  });
});

describe("Indicator", () => {
  it("renders a status chip with the semantic color", async () => {
    const result = await renderTree((b) => {
      b.openComponent(0, Indicator);
      b.addAttribute(1, "color", "success");
      b.addAttribute(2, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Online"));
      b.closeComponent();
    });
    await settle(result);
    const chip = result.container.querySelector(".fui-indicator")!;
    expect(chip.className).toBe("fui-indicator fui-indicator--success");
    expect(chip.getAttribute("role")).toBe("status");
    expect(chip.querySelector(".fui-indicator__label")!.textContent).toBe("Online");
    result.dispose();
  });

  it("renders nothing at all when visible is false", async () => {
    const result = await renderOne(Indicator, (b) => b.addAttribute(1, "visible", false));
    expect(result.container.querySelector(".fui-indicator")).toBeNull();
    result.dispose();
  });
});

describe("Alert", () => {
  it("maps legacy variant names onto Fluent severities", async () => {
    const primary = await renderOne(Alert, (b) => b.addAttribute(1, "variant", "primary"));
    expect(primary.container.querySelector(".fui-alert")!.className).toContain("fui-alert--info");

    const danger = await renderOne(Alert, (b) => b.addAttribute(1, "variant", "danger"));
    expect(danger.container.querySelector(".fui-alert")!.className).toContain("fui-alert--danger");
    primary.dispose();
    danger.dispose();
  });

  it("keeps role=alert and dismisses through the close button + callback", async () => {
    let dismissed = false;
    const result = await renderTree((b) => {
      b.openComponent(0, Alert);
      b.addAttribute(1, "variant", "success");
      b.addAttribute(2, "dismissible", true);
      b.addAttribute(3, "onDismissed", EventCallback.unbound(async () => { dismissed = true; }));
      b.addAttribute(4, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Saved."));
      b.closeComponent();
    });
    await settle(result);
    const alert = result.container.querySelector(".fui-alert")!;
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.className).toContain("fui-alert--success");

    click(result.container, ".fui-alert__dismiss");
    await settle(result);
    expect(result.container.querySelector(".fui-alert")).toBeNull();
    expect(dismissed).toBe(true);
    result.dispose();
  });
});

describe("Breadcrumb", () => {
  it("renders a nav landmark list for the slotted items", async () => {
    const result = await renderTree((b) => {
      b.openComponent(0, Breadcrumb);
      b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => {
        c.openComponent(0, BreadcrumbItem as never);
        c.addAttribute(1, "href", "#");
        c.addAttribute(2, "childContent", (d: RenderTreeBuilder) => d.addContent(0, "Home"));
        c.closeComponent();
      });
      b.closeComponent();
    });
    await settle(result);
    expect(result.container.querySelector(".fui-breadcrumb")!.getAttribute("aria-label")).toBe("breadcrumb");
    expect(result.container.querySelector(".fui-breadcrumb__list")).not.toBeNull();
    result.dispose();
  });

  it("marks the active item with aria-current and renders it linkless", async () => {
    const result = await renderTree((b) => {
      b.openComponent(0, Breadcrumb);
      b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => {
        c.openComponent(0, BreadcrumbItem as never);
        c.addAttribute(1, "href", "/home");
        c.addAttribute(2, "childContent", (d: RenderTreeBuilder) => d.addContent(0, "Home"));
        c.closeComponent();
        c.openComponent(3, BreadcrumbItem as never);
        c.addAttribute(4, "active", true);
        c.addAttribute(5, "childContent", (d: RenderTreeBuilder) => d.addContent(0, "Detail"));
        c.closeComponent();
      });
      b.closeComponent();
    });
    await settle(result);
    expect(result.container.querySelector(".fui-breadcrumb")!.getAttribute("aria-label")).toBe("breadcrumb");
    const links = result.container.querySelectorAll(".fui-breadcrumb__link");
    expect(links.length).toBe(1);
    expect(links[0]!.getAttribute("href")).toBe("/home");
    const current = result.container.querySelector(".fui-breadcrumb__current")!;
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.querySelector("a")).toBeNull();
    result.dispose();
  });

  it("renders an inactive item as a link without aria-current", async () => {
    const result = await renderOne(BreadcrumbItem, (b) => {
      b.addAttribute(1, "href", "/home");
      b.addAttribute(2, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Home"));
    });
    const link = result.container.querySelector(".fui-breadcrumb__link")!;
    expect(link.getAttribute("href")).toBe("/home");
    expect(link.getAttribute("aria-current")).toBeNull();
    expect(link.textContent).toBe("Home");
    result.dispose();
  });
});

describe("Pagination", () => {
  it("labels all controls accessibly and marks the current page", async () => {
    const result = await renderOne(Pagination, (b) => {
      b.addAttribute(1, "page", 2);
      b.addAttribute(2, "totalPages", 10);
    });
    expect(result.container.querySelector("button[aria-label='First page']")).not.toBeNull();
    expect(result.container.querySelector("button[aria-label='Last page']")).not.toBeNull();
    const prev = result.container.querySelector("button[aria-label='Previous page']")!;
    const next = result.container.querySelector("button[aria-label='Next page']")!;
    expect(prev.hasAttribute("disabled")).toBe(false);
    expect(next.hasAttribute("disabled")).toBe(false);
    const current = result.container.querySelector(".fui-pagination__page--current")!;
    expect(current.getAttribute("aria-current")).toBe("page");
    // Window includes both edges with an ellipsis between 1 and the 0..4 window.
    expect(result.container.textContent).toContain("10");
    expect(result.container.querySelectorAll(".fui-pagination__ellipsis").length).toBeGreaterThan(0);
    result.dispose();
  });

  it("fires onPageChange with the clicked page and never keeps its own state", async () => {
    const seen: number[] = [];
    const result = await renderOne(Pagination, (b) => {
      b.addAttribute(1, "page", 1);
      b.addAttribute(2, "totalPages", 5);
      b.addAttribute(3, "onPageChange", EventCallback.unbound(async (n: number) => { seen.push(n); }));
    });
    // First page: prev/first disabled, clicking does nothing on its own.
    click(result.container, "button[aria-label='First page']");
    await settle(result);
    expect(seen).toEqual([]);
    click(result.container, "button[aria-label='Next page']");
    await settle(result);
    expect(seen).toEqual([2]);
    // Controlled: page prop untouched, so "Next" fires 2 again.
    click(result.container, "button[aria-label='Next page']");
    await settle(result);
    expect(seen).toEqual([2, 2]);
    result.dispose();
  });
});
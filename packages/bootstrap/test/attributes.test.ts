/**
 * `@attributes` on the Bootstrap skin's components (design-library-completeness.md L13): a `class` appends to the
 * component's own classes, and any other attribute lands on its root element — as on the Fluent twins and on
 * Blazor's components (`AdditionalAttributes`).
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import type { ComponentType, RenderTreeBuilder } from "@tsazor/runtime";
import {
  Accordion,
  Breadcrumb,
  BreadcrumbItem,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Navbar,
  Pagination,
  Spinner,
  Tab,
  Table,
  Tabs,
  Toaster,
  ToastRegion,
} from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

/** Renders `component` with `class="extra"` and `data-probe="yes"` (plus `attrs`) and returns the probed element. */
async function probe(component: ComponentType, attrs: Record<string, unknown> = {}, content?: (b: RenderTreeBuilder) => void): Promise<HTMLElement> {
  const result = await renderTree(
    (b) => {
      b.openComponent(0, component);
      let seq = 1;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.addAttribute(20, "class", "extra");
      b.addAttribute(21, "data-probe", "yes");
      if (content) b.addAttribute(22, "childContent", content);
      b.closeComponent();
    },
    { services: (services) => services.registerValue(Toaster, new Toaster()) },
  );
  mounted.push(result);
  await result.renderer.waitUntilIdle();
  const element = result.container.querySelector<HTMLElement>("[data-probe]");
  if (element === null) throw new Error(`${component.name}: no element took the attributes`);
  return element;
}

const text = (value: string) => (b: RenderTreeBuilder) => b.addContent(0, value);

describe("@attributes on the Bootstrap components", () => {
  it.each([
    ["Accordion", Accordion, {}, "accordion extra", undefined],
    ["Breadcrumb", Breadcrumb, {}, "extra", undefined],
    ["BreadcrumbItem", BreadcrumbItem, { href: "/orders" }, "breadcrumb-item extra", text("Orders")],
    ["Card", Card, {}, "card extra", undefined],
    ["CardBody", CardBody, {}, "card-body extra", undefined],
    ["CardFooter", CardFooter, {}, "card-footer extra", undefined],
    ["CardHeader", CardHeader, {}, "card-header extra", undefined],
    ["CardTitle", CardTitle, {}, "card-title extra", text("Order 101")],
    ["Navbar", Navbar, { brand: "Bakery" }, "navbar navbar-expand-lg bg-body-tertiary extra", undefined],
    ["Pagination", Pagination, { pageCount: 3 }, "extra", undefined],
    ["Spinner", Spinner, {}, "d-inline-flex align-items-center gap-2 extra", undefined],
    ["Table", Table, {}, "table extra", undefined],
    ["Tabs", Tabs, {}, "extra", undefined],
    ["ToastRegion", ToastRegion, {}, "toast-container position-fixed p-3 bottom-0 end-0 extra", undefined],
  ] as const)("%s", async (_name, component, attrs, classes, content) => {
    const element = await probe(component as ComponentType, attrs, content);
    expect(element.className).toBe(classes);
    expect(element.getAttribute("data-probe")).toBe("yes");
  });

  it("Tab: on its panel", async () => {
    const result = await renderTree((b) => {
      b.openComponent(0, Tabs);
      b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => {
        c.openComponent(0, Tab);
        c.addAttribute(1, "title", "Open");
        c.addAttribute(2, "class", "extra");
        c.addAttribute(3, "data-probe", "yes");
        c.closeComponent();
      });
      b.closeComponent();
    });
    mounted.push(result);
    await result.renderer.waitUntilIdle();
    const panel = result.container.querySelector<HTMLElement>("[role=tabpanel]")!;
    expect(panel.className).toBe("tab-pane fade show active extra");
    expect(panel.getAttribute("data-probe")).toBe("yes");
  });

  it("a caller's attribute of the same name wins over the component's", async () => {
    const element = await probe(Breadcrumb, { "aria-label": "Folders" });
    expect(element.getAttribute("aria-label")).toBe("Folders");
  });
});

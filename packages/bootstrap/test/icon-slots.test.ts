/**
 * Icons on the components (design-icons.md step 4), with the Fluent skin's parameters: `iconStart`/`iconEnd` on
 * Button, DropdownItem, Badge and NavbarLink, `iconStart` on Tab; and the skin's own icons (core-icons.ts) in the grid.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, NavigationManager, type RenderTreeBuilder } from "@tsazor/runtime";
import { icon } from "@tsazor/ui";
import { Badge, Button, DataGrid, DropdownItem, Icon, NavbarLink, PropertyColumn, Tab, Tabs } from "../dist/index.js";
import { ArrowDownUp, CaretUpFill } from "../src/core-icons";

const save = icon("save", '<svg viewBox="0 0 16 16"><path d="M1 1h14"/></svg>');
const open = icon("open", '<svg viewBox="0 0 16 16"><path d="M2 2h12"/></svg>');

async function settle(result: RenderResult): Promise<void> {
  await result.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await result.settle();
}

async function renderOne(component: unknown, attrs: (b: RenderTreeBuilder) => void): Promise<RenderResult> {
  const result = await renderTree((b) => {
    b.openComponent(0, component as never);
    attrs(b);
    b.closeComponent();
  });
  await settle(result);
  return result;
}

const text = (content: string) => (b: RenderTreeBuilder) => b.addContent(0, content);
const paths = (element: Element) => [...element.querySelectorAll("svg path")].map((path) => path.getAttribute("d"));
const pathOf = (value: { content: string }) => /d="([^"]*)"/.exec(value.content)![1];
const classes = (element: Element) => [...element.querySelectorAll("svg")].map((svg) => svg.getAttribute("class"));

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});
const keep = (result: RenderResult) => (mounted.push(result), result);

describe("Icon", () => {
  it("sits on the text's baseline, as bootstrap-icons.css sets .bi, and keeps its color", async () => {
    const result = keep(await renderOne(Icon, (b) => {
      b.addAttribute(1, "value", save);
      b.addAttribute(2, "color", "red");
    }));
    const svg = result.container.querySelector("svg")! as SVGElement;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.style.verticalAlign).toBe("-0.125em");
    expect(svg.style.color).toBe("red");
  });
});

describe("Button", () => {
  it("draws iconStart before the label and iconEnd after it, spaced from it", async () => {
    const result = keep(await renderOne(Button, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "iconEnd", open);
      b.addAttribute(3, "childContent", text("Save"));
    }));
    const button = result.container.querySelector("button")!;
    expect(paths(button)).toEqual(["M1 1h14", "M2 2h12"]);
    expect(classes(button)).toEqual(["bi me-2", "bi ms-2"]);
    expect(button.textContent).toBe("Save");
  });

  it("an icon-only button has no spacing and is named by ariaLabel", async () => {
    const result = keep(await renderOne(Button, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "ariaLabel", "Save");
    }));
    const button = result.container.querySelector("button")!;
    expect(classes(button)).toEqual(["bi"]);
    expect(button.getAttribute("aria-label")).toBe("Save");
  });
});

describe("DropdownItem, Badge, NavbarLink, Tab", () => {
  it("a dropdown item lines its icons up with the label; iconEnd at the far end", async () => {
    const result = keep(await renderOne(DropdownItem, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "iconEnd", open);
      b.addAttribute(3, "childContent", text("Save"));
    }));
    const item = result.container.querySelector("[role=menuitem]")!;
    expect(item.className).toBe("dropdown-item d-flex align-items-center gap-2");
    expect(classes(item)).toEqual(["bi", "bi ms-auto"]);
    const plain = keep(await renderOne(DropdownItem, (b) => b.addAttribute(1, "childContent", text("Plain"))));
    expect(plain.container.querySelector("[role=menuitem]")!.className).toBe("dropdown-item");
  });

  it("a badge draws its icons at 12px, named by iconLabel", async () => {
    const result = keep(await renderOne(Badge, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "iconLabel", "Saved");
      b.addAttribute(3, "childContent", text("3"));
    }));
    const svg = result.container.querySelector(".badge svg")!;
    expect(svg.getAttribute("width")).toBe("12");
    expect(svg.getAttribute("aria-label")).toBe("Saved");
    expect(svg.getAttribute("class")).toBe("bi me-1");
  });

  it("a navbar link takes iconStart", async () => {
    const navigation = new NavigationManager();
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, NavbarLink);
        b.addAttribute(1, "href", "/docs");
        b.addAttribute(2, "iconStart", save);
        b.addAttribute(3, "childContent", text("Docs"));
        b.closeComponent();
      }
    }
    const result = keep(await render(Host, { services: (services) => services.registerValue(NavigationManager as never, navigation) }));
    await settle(result);
    expect(paths(result.container.querySelector("a.nav-link")!)).toEqual(["M1 1h14"]);
    navigation.dispose();
  });

  it("a tab's iconStart shows in the nav", async () => {
    const result = keep(await renderOne(Tabs, (b) => {
      b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => {
        c.openComponent(0, Tab);
        c.addAttribute(1, "title", "Files");
        c.addAttribute(2, "iconStart", save);
        c.closeComponent();
      });
    }));
    await settle(result);
    const tab = result.container.querySelector("[role=tab]")!;
    expect(tab.textContent).toBe("Files");
    expect(paths(tab)).toEqual(["M1 1h14"]);
  });
});

describe("the skin's own icons", () => {
  it("the grid's sort indicator is a Bootstrap icon", async () => {
    const result = keep(await renderOne(DataGrid, (b) => {
      b.addAttribute(1, "items", [{ name: "Ada" }, { name: "Bo" }]);
      b.addAttribute(2, "childContent", (c: RenderTreeBuilder) => {
        c.openComponent(0, PropertyColumn);
        c.addAttribute(1, "property", (row: { name: string }) => row.name);
        c.addAttribute(2, "title", "Name");
        c.addAttribute(3, "sortable", true);
        c.closeComponent();
      });
    }));
    await settle(result);
    const head = result.container.querySelector("th")!;
    // Without reorderableColumns the header carries the sort indicator only (no grip).
    expect(paths(head)).toEqual([pathOf(ArrowDownUp)]);
    head.querySelector("button")!.click();
    await settle(result);
    expect(paths(result.container.querySelector("th")!)).toEqual([pathOf(CaretUpFill)]);
  });
});

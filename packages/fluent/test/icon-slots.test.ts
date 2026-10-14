/**
 * Icons on the components (design-icons.md step 4): Fluent UI Blazor's `IconStart`/`IconEnd` on Button, MenuItem,
 * Badge and the links, `IconStart` on Tab, the tree item's four icons, SidebarNav's rest and active icons; and the
 * skin's own icons (core-icons.ts) in Alert, the close buttons, the pager and the grid.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, NavigationManager, type RenderTreeBuilder } from "@tsazor/runtime";
import { icon, type TreeViewItem } from "@tsazor/ui";
import { Alert, Badge, Button, Icon, MenuItem, NavbarLink, Pagination, SidebarNav, Tab, Tabs, TreeView } from "../dist/index.js";
import { ChevronRight12Regular, Dismiss20Regular, Info20Filled, Warning20Filled } from "../src/core-icons";

const save = icon("save", '<svg viewBox="0 0 20 20"><path d="M1 1h18"/></svg>');
const open = icon("open", '<svg viewBox="0 0 20 20"><path d="M2 2h16"/></svg>');
const folder = icon("folder", '<svg viewBox="0 0 16 16"><path d="M3 3h10"/></svg>');

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
/** The `d` of each path in the element, in order. */
const paths = (element: Element) => [...element.querySelectorAll("svg path")].map((path) => path.getAttribute("d"));
const pathOf = (value: { content: string }) => /d="([^"]*)"/.exec(value.content)![1];

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});
const keep = (result: RenderResult) => (mounted.push(result), result);

describe("Icon", () => {
  it("draws a value at its own size, as Fluent UI Blazor does", async () => {
    const own = keep(await renderOne(Icon, (b) => b.addAttribute(1, "value", folder)));
    expect(own.container.querySelector("svg")!.getAttribute("width")).toBe("16");
    const twenty = keep(await renderOne(Icon, (b) => b.addAttribute(1, "value", save)));
    expect(twenty.container.querySelector("svg")!.getAttribute("width")).toBe("20");
  });

  it("a class of null keeps the icon's own", async () => {
    const result = keep(await renderOne(Icon, (b) => {
      b.addAttribute(1, "value", save);
      b.addAttribute(2, "class", null);
    }));
    expect(result.container.querySelector("svg")!.getAttribute("class")).toBe("fui-icon");
  });
});

describe("Button", () => {
  it("draws iconStart before the label and iconEnd after it", async () => {
    const result = keep(await renderOne(Button, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "iconEnd", open);
      b.addAttribute(3, "childContent", text("Save"));
    }));
    const button = result.container.querySelector("button")!;
    const order = [...button.childNodes].filter((node) => node.nodeType !== Node.COMMENT_NODE).map((node) => node.nodeName.toLowerCase());
    expect(order).toEqual(["svg", "#text", "svg"]);
    expect(paths(button)).toEqual(["M1 1h18", "M2 2h16"]);
    expect(button.querySelector("svg")!.getAttribute("class")).toBe("fui-icon fui-button__icon");
    expect(button.className).not.toContain("fui-button--icon-only");
  });

  it("is an icon-only button without a label, named by ariaLabel", async () => {
    const result = keep(await renderOne(Button, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "ariaLabel", "Save");
    }));
    const button = result.container.querySelector("button")!;
    expect(button.className).toContain("fui-button--icon-only");
    expect(button.getAttribute("aria-label")).toBe("Save");
    expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("a link button takes the icons too", async () => {
    const result = keep(await renderOne(Button, (b) => {
      b.addAttribute(1, "href", "/docs");
      b.addAttribute(2, "iconEnd", open);
      b.addAttribute(3, "childContent", text("Docs"));
    }));
    expect(paths(result.container.querySelector("a")!)).toEqual(["M2 2h16"]);
  });
});

describe("MenuItem, Badge, NavbarLink", () => {
  it("a menu item frames its label with the icons", async () => {
    const result = keep(await renderOne(MenuItem, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "iconEnd", open);
      b.addAttribute(3, "childContent", text("Save"));
    }));
    const item = result.container.querySelector("[role=menuitem]")!;
    expect(paths(item)).toEqual(["M1 1h18", "M2 2h16"]);
    expect(item.lastElementChild!.getAttribute("class")).toContain("fui-menu__icon--end");
  });

  it("a badge draws its icons at 12px (10 when small), named by iconLabel", async () => {
    const result = keep(await renderOne(Badge, (b) => {
      b.addAttribute(1, "iconStart", save);
      b.addAttribute(2, "iconLabel", "Saved");
      b.addAttribute(3, "childContent", text("3"));
    }));
    const svg = result.container.querySelector(".fui-badge svg")!;
    expect(svg.getAttribute("width")).toBe("12");
    expect(svg.getAttribute("aria-label")).toBe("Saved");
    const small = keep(await renderOne(Badge, (b) => {
      b.addAttribute(1, "iconEnd", save);
      b.addAttribute(2, "size", "small");
    }));
    expect(small.container.querySelector(".fui-badge svg")!.getAttribute("width")).toBe("10");
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
    const link = result.container.querySelector("a")!;
    expect(paths(link)).toEqual(["M1 1h18"]);
    expect(link.textContent).toBe("Docs");
    navigation.dispose();
  });
});

describe("Tabs", () => {
  it("draws a tab's iconStart in the tab list", async () => {
    const result = keep(await renderOne(Tabs, (b) => {
      b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => {
        c.openComponent(0, Tab);
        c.addAttribute(1, "title", "Files");
        c.addAttribute(2, "iconStart", folder);
        c.closeComponent();
        c.openComponent(3, Tab);
        c.addAttribute(4, "title", "Notes");
        c.closeComponent();
      });
    }));
    await settle(result);
    const tabs = [...result.container.querySelectorAll("[role=tab]")];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Files", "Notes"]);
    expect(paths(tabs[0]!)).toEqual(["M3 3h10"]);
    expect(paths(tabs[1]!)).toEqual([]);
  });
});

describe("TreeView", () => {
  const items: TreeViewItem[] = [
    { id: "docs", text: "Docs", iconStart: folder, iconEnd: save, items: [{ id: "a", text: "A" }] },
    { id: "src", text: "Src", iconCollapsed: folder, iconExpanded: open, expanded: true, items: [{ id: "b", text: "B" }] },
  ];

  it("frames the text with iconStart/iconEnd; the chevron is Fluent's, or the item's for its state", async () => {
    const result = keep(await renderOne(TreeView, (b) => {
      b.addAttribute(1, "items", items);
      b.addAttribute(2, "ariaLabel", "Files");
    }));
    const row = (id: string) => result.container.querySelector(`[data-tree-id="${id}"] > .fui-tree__row`)!;
    // Docs: the default chevron (turned by CSS while open), then its own icons around the text.
    expect(paths(row("docs"))).toEqual([pathOf(ChevronRight12Regular), "M3 3h10", "M1 1h18"]);
    expect(row("docs").querySelector(".fui-tree__chevron svg")!.getAttribute("class")).toContain("fui-tree__chevron-icon");
    // Src starts open: its expanded icon replaces the chevron, not turned.
    expect(paths(row("src"))).toEqual(["M2 2h16"]);
    expect(row("src").querySelector(".fui-tree__chevron svg")!.getAttribute("class")).toBe("fui-icon");
  });
});

describe("SidebarNav", () => {
  it("shows the rest icon, and the active one on the current page", async () => {
    const navigation = new NavigationManager();
    navigation.navigateTo("/files");
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, SidebarNav);
        b.addAttribute(1, "compact", true);
        b.addAttribute(2, "links", [
          { href: "/files", label: "Files", icon: folder, iconActive: open },
          { href: "/notes", label: "Notes", icon: save },
          { href: "/plain", label: "Plain" },
        ]);
        b.closeComponent();
      }
    }
    const result = keep(await render(Host, { services: (services) => services.registerValue(NavigationManager as never, navigation) }));
    await settle(result);
    const links = [...result.container.querySelectorAll(".fui-nav__link")];
    expect(links.map((link) => link.textContent)).toEqual(["Files", "Notes", "Plain"]);
    expect([...links[0]!.querySelectorAll("svg")].map((svg) => svg.getAttribute("class"))).toEqual([
      "fui-icon fui-nav__icon fui-nav__icon--rest",
      "fui-icon fui-nav__icon fui-nav__icon--active",
    ]);
    expect(links[0]!.className).toContain("fui-nav__link--active");
    // The rail: the label is a link's tooltip when an icon stands for it.
    expect(links.map((link) => link.getAttribute("title"))).toEqual(["Files", "Notes", null]);
    navigation.dispose();
  });
});

describe("the skin's own icons", () => {
  it("Alert draws Fluent's filled status icon and a Dismiss icon", async () => {
    const result = keep(await renderOne(Alert, (b) => {
      b.addAttribute(1, "intent", "warning");
      b.addAttribute(2, "dismissible", true);
    }));
    expect(paths(result.container)).toEqual([pathOf(Warning20Filled), pathOf(Dismiss20Regular)]);
    const info = keep(await renderOne(Alert, (b) => b.addAttribute(1, "intent", "neutral")));
    expect(paths(info.container)).toEqual([pathOf(Info20Filled)]);
  });

  it("the pager's buttons are chevron icons, named by their labels", async () => {
    const result = keep(await renderOne(Pagination, (b) => {
      b.addAttribute(1, "page", 2);
      b.addAttribute(2, "pageCount", 5);
    }));
    const first = result.container.querySelector("[aria-label='First page']")!;
    expect(first.textContent).toBe("");
    expect(first.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });
});

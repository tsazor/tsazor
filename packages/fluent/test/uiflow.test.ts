/**
 * Table + SidebarNav tests through the compiled dist pipeline. SidebarNav
 * mounts a real NavigationManager so NavLink's active resolution runs.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree } from "@tsazor/testing";
import { ComponentBase, NavigationManager, NavLinkMatch, type RenderTreeBuilder } from "@tsazor/runtime";
import { SidebarNav, Table } from "../dist/index.js";

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Awaited<ReturnType<typeof renderTree>>["renderer"]): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

interface OrderRow {
  id: number;
  customer: string;
  total: number;
}

/** Three demo orders for the table tests. */
function sampleOrders(): OrderRow[] {
  return [
    { id: 1, customer: "Alice", total: 42 },
    { id: 2, customer: "Bruno", total: 17 },
    { id: 3, customer: "Chiara", total: 99 },
  ];
}

/** Renders a Table with two header columns via the header fragment and three
 *  rows built by the passed row factory. */
async function renderTable(items: OrderRow[]): Promise<ReturnType<typeof renderTree>> {
  const result = await renderTree(b => {
    b.openComponent(0, Table);
    b.addAttribute(1, "items", items);
    b.addAttribute(
      2,
      "headerContent",
      (h: RenderTreeBuilder) => {
        h.openElement(0, "tr");
        h.openElement(1, "th");
        h.addContent(2, "Customer");
        h.closeElement();
        h.openElement(3, "th");
        h.addContent(4, "Total");
        h.closeElement();
        h.closeElement();
      },
    );
    b.addAttribute(
      3,
      "rowContent",
      (row: OrderRow) =>
        (r: RenderTreeBuilder) => {
          r.openElement(0, "tr");
          r.addAttribute(1, "data-order-id", row.id);
          r.openElement(2, "td");
          r.addContent(3, row.customer);
          r.closeElement();
          r.openElement(4, "td");
          r.addContent(5, String(row.total));
          r.closeElement();
          r.closeElement();
        },
    );
    b.addAttribute(4, "hover", true);
    b.addAttribute(5, "striped", true);
    b.closeComponent();
  });
  await settle(result.renderer);
  return result;
}

/** SidebarNav host page (NavLink resolves the current route from DI). */
class NavHost extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, SidebarNav);
    b.addAttribute(1, "ariaLabel", "Primary");
    b.addAttribute(
      2,
      "links",
      [
        // Root link matches exactly (Blazor: a Prefix link to the base is active everywhere).
        { href: "/", label: "Overview", match: NavLinkMatch.All },
        { href: "/orders", label: "Orders" },
        { href: "/settings", label: "Settings" },
      ],
    );
    b.closeComponent();
  }
}

const navigations: NavigationManager[] = [];

afterEach(() => {
  document.body.innerHTML = "";
  for (const navigation of navigations.splice(0)) navigation.dispose();
});

describe("Table", () => {
  it("renders header columns and one tr per row", async () => {
    const { container } = await renderTable(sampleOrders());
    const table = container.querySelector("table")!;
    expect(table.className).toBe("fui-table fui-table--striped fui-table--hover");
    expect([...container.querySelectorAll("thead th")].map(th => th.textContent)).toEqual(["Customer", "Total"]);
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute("data-order-id")).toBe("1");
    expect(rows[0]!.querySelector("td")!.textContent).toBe("Alice");
    expect(rows[2]!.querySelector("td")!.textContent).toBe("Chiara");
  });

  it("renders the empty-state row instead of tbody rows", async () => {
    const { container } = await renderTable([]);
    expect(container.querySelector("tbody")!.textContent).toContain("No entries");
    expect(container.querySelector("tbody")).toBeTruthy();
  });
});

/** Compact-variant nav host (NavLink needs the NavigationManager service). */
class CompactNavHost extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, SidebarNav);
    b.addAttribute(1, "ariaLabel", "Rail");
    b.addAttribute(2, "compact", true);
    b.addAttribute(3, "links", [{ href: "/a", label: "A" }]);
    b.closeComponent();
  }
}

describe("SidebarNav", () => {
  it("renders NavLink entries and marks the current route", async () => {
    const navigation = new NavigationManager();
    navigations.push(navigation);
    navigation.navigateTo("/orders");

    const result = await render(NavHost, {
      services: (services) => services.registerValue(NavigationManager as never, navigation),
    });
    await settle(result.renderer);

    const links = [...result.container.querySelectorAll(".fui-nav__link")];
    expect(links.map(a => a.textContent)).toEqual(["Overview", "Orders", "Settings"]);
    const orders = links[1]!;
    expect(orders.className).toContain("fui-nav__link--active");
    expect(orders.getAttribute("aria-current")).toBe("page");
    expect(links[0]!.className).not.toContain("fui-nav__link--active");
    result.dispose();
  });

  it("renders the nav with aria-label and the compact variant class", async () => {
    const navigation = new NavigationManager();
    navigations.push(navigation);
    const result = await render(CompactNavHost, {
      services: (services) => services.registerValue(NavigationManager as never, navigation),
    });
    await settle(result.renderer);
    const nav = result.container.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Rail");
    expect(nav.className).toBe("fui-nav fui-nav--compact");
    result.dispose();
  });
});
/**
 * A DataGrid's detail rows (MudDataGrid's ChildRowContent and HierarchyColumn, MudTable's ChildRowContent; the
 * BlazorHero port's B44): `detailContent` below its row while it shows, a DetailsColumn's toggle with aria-expanded and
 * aria-controls, one at a time with `detailsMode="single"`, kept by the row's key across a reload, with grouping and in
 * a virtualized grid (the detail row is part of its row's item).
 */
import { describe, expect, it } from "vitest";
import { render, renderTree } from "@tsazor/testing";
import type { RenderFragment, RenderTreeBuilder } from "@tsazor/runtime";
import { DataGrid, DetailsColumn, PropertyColumn } from "../dist/index.js";

interface Order {
  id: number;
  customer: string;
}

const orders: Order[] = [
  { id: 1, customer: "Marta" },
  { id: 2, customer: "Jonas" },
  { id: 3, customer: "Lena" },
];

type Attrs = Record<string, unknown>;
function component(b: RenderTreeBuilder, seq: number, type: unknown, attrs: Attrs): void {
  b.openComponent(seq, type as never);
  let n = seq + 1;
  for (const [name, value] of Object.entries(attrs)) b.addAttribute(n++, name, value);
  b.closeComponent();
}

const detail = (order: Order): RenderFragment => (b) => b.addContent(0, `Lines of ${order.customer}`);

async function renderGrid(attrs: Attrs) {
  const result = await renderTree((b) => {
    component(b, 0, DataGrid, {
      ariaLabel: "Orders",
      detailContent: detail,
      ...attrs,
      childContent: ((inner: RenderTreeBuilder) => {
        component(inner, 0, DetailsColumn, { rowName: (order: Order) => `order ${order.id}` });
        component(inner, 4, PropertyColumn, { property: (order: Order) => order.customer });
      }) as RenderFragment,
    });
  });
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await result.settle();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  await settle();
  const toggle = (name: string) => result.container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  const click = async (name: string) => {
    toggle(name).click();
    await settle();
  };
  /** The body's rows, a data row by its customer, a detail row by its text. */
  const lines = () => [...result.container.querySelectorAll("tbody > tr:not([aria-hidden])")].map((row) => row.classList.contains("fui-datagrid__detail") ? `> ${row.textContent!.trim()}` : row.querySelectorAll("td")[1]?.textContent?.trim() ?? "");
  return { ...result, settle, toggle, click, lines };
}

describe("DataGrid detail rows", () => {
  it("show a row's details below it, the toggle expanded and controlling them, its label unchanged; a second click closes them", async () => {
    const { container, toggle, click, lines } = await renderGrid({ items: orders });
    expect(lines()).toEqual(["Marta", "Jonas", "Lena"]);
    expect(toggle("Show details of order 2").getAttribute("aria-expanded")).toBe("false");
    await click("Show details of order 2");
    expect(lines()).toEqual(["Marta", "Jonas", "> Lines of Jonas", "Lena"]);
    const open = toggle("Show details of order 2");
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const detailRow = container.querySelector(".fui-datagrid__detail")!;
    expect(open.getAttribute("aria-controls")).toBe(detailRow.id);
    expect(detailRow.querySelector("td")!.getAttribute("colspan")).toBe("2");
    await click("Show details of order 2");
    expect(lines()).toEqual(["Marta", "Jonas", "Lena"]);
    expect(toggle("Show details of order 2").hasAttribute("aria-controls")).toBe(false);
  });

  it("open several by default, one at a time with detailsMode single", async () => {
    const several = await renderGrid({ items: orders });
    await several.click("Show details of order 1");
    await several.click("Show details of order 3");
    expect(several.lines()).toEqual(["Marta", "> Lines of Marta", "Jonas", "Lena", "> Lines of Lena"]);
    several.dispose();

    const single = await renderGrid({ items: orders, detailsMode: "single" });
    await single.click("Show details of order 1");
    await single.click("Show details of order 3");
    expect(single.lines()).toEqual(["Marta", "Jonas", "Lena", "> Lines of Lena"]);
  });

  it("stay with their row in a grouped grid", async () => {
    const { click, lines } = await renderGrid({ items: orders, group: ((order: Order) => order.customer.length) as never });
    await click("Show details of order 3");
    // Groups: 4 letters (Lena), 5 letters (Marta, Jonas).
    expect(lines().filter((line) => line !== "")).toEqual(["Lena", "> Lines of Lena", "Marta", "Jonas"]);
  });

  it("are part of their row's item in a virtualized grid", async () => {
    const many: Order[] = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, customer: `C${i + 1}` }));
    const { container, click } = await renderGrid({ items: many, virtualize: true, itemSize: 40 });
    await click("Show details of order 2");
    const detailRow = container.querySelector(".fui-datagrid__detail")!;
    expect(detailRow.hasAttribute("data-virtualize-continuation")).toBe(true);
    expect(detailRow.previousElementSibling!.textContent).toContain("C2");
  });

  it("stay open across a reload of fresh row objects when the grid keys its rows", async () => {
    const columns = ((inner: RenderTreeBuilder) => {
      component(inner, 0, DetailsColumn, { rowName: (order: Order) => `order ${order.id}` });
      component(inner, 4, PropertyColumn, { property: (order: Order) => order.customer });
    }) as RenderFragment;
    const fresh = () => orders.map((order) => ({ ...order }));
    const keyed = await render(DataGrid, { parameters: { items: fresh(), itemKey: (order: Order) => order.id, detailContent: detail, childContent: columns } as never });
    await keyed.click("button[aria-label=\"Show details of order 1\"]");
    await keyed.setParameters({ items: fresh() } as never);
    expect(keyed.findAll(".fui-datagrid__detail").map((row) => row.textContent!.trim())).toEqual(["Lines of Marta"]);
    keyed.dispose();

    // Without a key the row is its object: a fresh one is another row, closed.
    const unkeyed = await render(DataGrid, { parameters: { items: fresh(), detailContent: detail, childContent: columns } as never });
    await unkeyed.click("button[aria-label=\"Show details of order 1\"]");
    await unkeyed.setParameters({ items: fresh() } as never);
    expect(unkeyed.findAll(".fui-datagrid__detail")).toEqual([]);
  });
});

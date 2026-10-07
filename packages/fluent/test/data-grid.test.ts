/**
 * DataGrid (QuickGrid-shaped) through the compiled components: the columns
 * register while they render, the table renders after them (Defer), sorting,
 * paging with Paginator, an ItemsProvider, selection and template columns.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment, type RenderTreeBuilder } from "@tsazor/runtime";
import { DataGrid, GridSort, PaginationState, Paginator, PropertyColumn, TemplateColumn } from "../dist/index.js";
import type { GridItemsProviderRequest } from "../dist/index.js";

interface Order {
  id: number;
  customer: string;
  total: number;
}

const orders: Order[] = [
  { id: 1, customer: "Marta", total: 12.5 },
  { id: 2, customer: "Jonas", total: 30 },
  { id: 3, customer: "Lena", total: 7 },
  { id: 4, customer: "Ali", total: 18 },
];

type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];
async function settle(renderer: Renderer): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await renderer.waitUntilIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

type Attrs = Record<string, unknown>;
function component(b: RenderTreeBuilder, seq: number, type: unknown, attrs: Attrs): void {
  b.openComponent(seq, type as never);
  let n = seq + 1;
  for (const [name, value] of Object.entries(attrs)) b.addAttribute(n++, name, value);
  b.closeComponent();
}

const customer = (o: Order): string => o.customer;
const total = (o: Order): number => o.total;

function grid(attrs: Attrs, columns: (b: RenderTreeBuilder) => void): (b: RenderTreeBuilder) => void {
  return (b) => component(b, 0, DataGrid, { ...attrs, childContent: columns as RenderFragment });
}

const texts = (container: Element, selector: string): string[] => [...container.querySelectorAll(selector)].map((cell) => cell.textContent!.trim());

describe("DataGrid", () => {
  it("renders a header per column and a row per item; titles come from the property lambda", async () => {
    const { container, renderer } = await renderTree(
      grid({ items: orders, ariaLabel: "Orders" }, (b) => {
        component(b, 0, PropertyColumn, { property: customer });
        component(b, 10, PropertyColumn, { property: total, title: "Total", format: (v: number) => v.toFixed(2), align: "end" });
      }),
    );
    await settle(renderer);
    expect(texts(container, "thead th")).toEqual(["customer", "Total"]);
    expect(texts(container, "tbody tr td:first-child")).toEqual(["Marta", "Jonas", "Lena", "Ali"]);
    expect(texts(container, "tbody tr td:last-child")).toEqual(["12.50", "30.00", "7.00", "18.00"]);
    expect(container.querySelector("tbody td:last-child")!.className).toBe("fui-datagrid__cell--end");
    expect(container.querySelector("table")!.getAttribute("aria-label")).toBe("Orders");
  });

  it("sorts on a header click and says so with aria-sort", async () => {
    const { container, renderer } = await renderTree(
      grid({ items: orders }, (b) => {
        component(b, 0, PropertyColumn, { property: customer, sortable: true });
        component(b, 10, PropertyColumn, { property: total, sortable: true, isDefaultSortColumn: true, initialSortDirection: "descending" });
      }),
    );
    await settle(renderer);
    expect(texts(container, "tbody tr td:first-child")).toEqual(["Jonas", "Ali", "Marta", "Lena"]);
    expect([...container.querySelectorAll("th")].map((th) => th.getAttribute("aria-sort"))).toEqual([null, "descending"]);

    container.querySelector<HTMLButtonElement>("th button")!.click();
    await settle(renderer);
    expect(texts(container, "tbody tr td:first-child")).toEqual(["Ali", "Jonas", "Lena", "Marta"]);
    expect([...container.querySelectorAll("th")].map((th) => th.getAttribute("aria-sort"))).toEqual(["ascending", null]);
    container.querySelector<HTMLButtonElement>("th button")!.click();
    await settle(renderer);
    expect(texts(container, "tbody tr td:first-child")[0]).toBe("Marta");
  });

  it("pages with a Paginator on a shared PaginationState", async () => {
    const pagination = new PaginationState();
    pagination.itemsPerPage = 3;
    const { container, renderer } = await renderTree((b) => {
      component(b, 0, DataGrid, { items: orders, pagination, childContent: ((inner: RenderTreeBuilder) => component(inner, 0, PropertyColumn, { property: customer })) as RenderFragment });
      component(b, 10, Paginator, { state: pagination });
    });
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Marta", "Jonas", "Lena"]);
    expect(container.querySelector(".fui-paginator__count")!.textContent!.trim()).toBe("4 items");
    expect(container.querySelector(".fui-paginator__page")!.textContent).toBe("Page 1 of 2");
    expect(container.querySelector<HTMLButtonElement>("[aria-label='Previous page']")!.disabled).toBe(true);

    container.querySelector<HTMLButtonElement>("[aria-label='Next page']")!.click();
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Ali"]);
    expect(container.querySelector(".fui-paginator__page")!.textContent).toBe("Page 2 of 2");
    expect(container.querySelector<HTMLButtonElement>("[aria-label='Last page']")!.disabled).toBe(true);
  });

  it("loads pages from an ItemsProvider, with the sort as property names", async () => {
    const requests: GridItemsProviderRequest<Order>[] = [];
    const pagination = new PaginationState();
    pagination.itemsPerPage = 2;
    const provider = async (request: GridItemsProviderRequest<Order>) => {
      requests.push(request);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const rows = request.applySorting(orders).slice(request.startIndex, request.startIndex + request.count!);
      return { items: rows, totalItemCount: orders.length };
    };
    const { container, renderer } = await renderTree(
      grid({ itemsProvider: provider, pagination }, (b) => {
        component(b, 0, PropertyColumn, { property: customer, sortable: true, isDefaultSortColumn: true });
      }),
    );
    await renderer.waitUntilIdle();
    expect(container.querySelector("tbody")!.textContent).toContain("Loading…");
    expect(container.querySelector("table")!.getAttribute("aria-busy")).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Ali", "Jonas"]);
    expect(container.querySelector("table")!.hasAttribute("aria-busy")).toBe(false);
    expect(requests[0]!.getSortByProperties()).toEqual([{ propertyName: "customer", direction: "ascending" }]);

    await pagination.setCurrentPageIndexAsync(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Lena", "Marta"]);
    expect(requests.at(-1)!.startIndex).toBe(2);
  });

  it("selects rows with checkboxes and reports them through selectedItemsChanged", async () => {
    let selected: Order[] = [];
    const { container, renderer } = await renderTree(
      grid({ items: orders, selectionMode: "multiple", selectedItemsChanged: EventCallback.unbound((value: Order[]) => { selected = value; }) }, (b) => {
        component(b, 0, PropertyColumn, { property: customer });
      }),
    );
    await settle(renderer);
    const boxes = () => [...container.querySelectorAll<HTMLInputElement>("tbody input[type=checkbox]")];
    expect(boxes().map((box) => box.getAttribute("aria-label"))).toEqual(["Select row 1", "Select row 2", "Select row 3", "Select row 4"]);
    boxes()[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(selected.map((o) => o.id)).toEqual([2]);
    expect(container.querySelectorAll("tbody tr")[1]!.className).toBe("fui-datagrid__row--selected");

    container.querySelector<HTMLInputElement>("thead input[type=checkbox]")!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(selected.map((o) => o.id)).toEqual([2, 1, 3, 4]);
  });

  it("renders a TemplateColumn with the row as context and sorts it by its sortBy", async () => {
    const { container, renderer } = await renderTree(
      grid({ items: orders }, (b) => {
        component(b, 0, TemplateColumn, {
          title: "Order",
          sortBy: GridSort.byDescending((o: Order) => o.id),
          childContent: (order: Order): RenderFragment => (inner) => {
            inner.openElement(0, "a");
            inner.addAttribute(1, "href", `/orders/${order.id}`);
            inner.addContent(2, `#${order.id}`);
            inner.closeElement();
          },
        });
      }),
    );
    await settle(renderer);
    expect(texts(container, "tbody a")).toEqual(["#1", "#2", "#3", "#4"]);
    container.querySelector<HTMLButtonElement>("th button")!.click();
    await settle(renderer);
    expect(texts(container, "tbody a")).toEqual(["#4", "#3", "#2", "#1"]);
  });

  it("collects the columns on every render: a column shown conditionally comes and goes", async () => {
    let showTotal = true;
    const { container, renderer, instance } = await renderTree(
      grid({ items: orders.slice(0, 1) }, (b) => {
        component(b, 0, PropertyColumn, { property: customer });
        if (showTotal) component(b, 10, PropertyColumn, { property: total });
      }),
    );
    await settle(renderer);
    expect(texts(container, "thead th")).toEqual(["customer", "total"]);
    showTotal = false;
    (instance as unknown as { stateHasChanged(): void }).stateHasChanged();
    await settle(renderer);
    expect(texts(container, "thead th")).toEqual(["customer"]);
    expect(texts(container, "tbody td")).toEqual(["Marta"]);
  });

  it("shows the empty content without rows", async () => {
    const { container, renderer } = await renderTree(
      grid({ items: [] }, (b) => component(b, 0, PropertyColumn, { property: customer })),
    );
    await settle(renderer);
    expect(container.querySelector("tbody td")!.getAttribute("colspan")).toBe("1");
    expect(container.querySelector("tbody")!.textContent!.trim()).toBe("No entries");
  });
});

describe("DataGrid virtualize", () => {
  const many: Order[] = Array.from({ length: 1_000 }, (_, i) => ({ id: i + 1, customer: `C${String(1000 - i).padStart(4, "0")}`, total: i }));

  it("renders only the rows in view between tr spacers, and says how many rows there are", async () => {
    const { container, renderer } = await renderTree(
      grid({ items: many, virtualize: true, itemSize: 40 }, (b) => {
        component(b, 0, PropertyColumn, { property: (o: Order) => o.id, sortable: true });
        component(b, 10, PropertyColumn, { property: customer, sortable: true });
      }),
    );
    await settle(renderer);
    const rows = [...container.querySelectorAll("tbody > tr")];
    expect(rows[0]!.className).toBe("virtualize-spacer");
    expect(rows.at(-1)!.className).toBe("virtualize-spacer");
    const data = rows.slice(1, -1);
    // happy-dom's viewport: 768 px / 40 px = 20 rows, plus 3 overscan below.
    expect(data.length).toBeLessThan(30);
    expect(data[0]!.querySelector("td")!.textContent).toBe("1");
    expect(data[0]!.getAttribute("aria-rowindex")).toBe("2");
    expect(container.querySelector("table")!.getAttribute("aria-rowcount")).toBe("1001");
    expect((rows.at(-1) as HTMLElement).style.height).toBe(`${(1_000 - data.length) * 40}px`);

    container.querySelectorAll<HTMLButtonElement>("th button")[1]!.click();
    await settle(renderer);
    expect(container.querySelector("tbody > tr:nth-child(2) td:nth-child(2)")!.textContent).toBe("C0001");
  });

  it("asks the ItemsProvider for the window in view, sorted", async () => {
    const requests: GridItemsProviderRequest<Order>[] = [];
    const provider = (request: GridItemsProviderRequest<Order>) => {
      requests.push(request);
      const sorted = request.applySorting(many);
      return { items: sorted.slice(request.startIndex, request.startIndex + request.count!), totalItemCount: many.length };
    };
    const { container, renderer } = await renderTree(
      grid({ itemsProvider: provider, virtualize: true, itemSize: 40 }, (b) => {
        component(b, 0, PropertyColumn, { property: customer, sortable: true });
      }),
    );
    await settle(renderer);
    expect(requests[0]!.startIndex).toBe(0);
    expect(container.querySelector("tbody > tr:nth-child(2) td")!.textContent).toBe("C1000");
    expect(container.querySelector("table")!.getAttribute("aria-rowcount")).toBe("1001");

    container.querySelector<HTMLButtonElement>("th button")!.click();
    await settle(renderer);
    expect(requests.at(-1)!.getSortByProperties()).toEqual([{ propertyName: "customer", direction: "ascending" }]);
    expect(container.querySelector("tbody > tr:nth-child(2) td")!.textContent).toBe("C0001");
  });

  it("refuses virtualize together with pagination", async () => {
    await expect(
      renderTree(grid({ items: many, virtualize: true, pagination: new PaginationState() }, (b) => component(b, 0, PropertyColumn, { property: customer }))),
    ).rejects.toThrow(/Virtualize and Pagination/);
  });
});

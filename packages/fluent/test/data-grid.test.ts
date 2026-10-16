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

type Renderer = Pick<Awaited<ReturnType<typeof renderTree>>, "settle">;
async function settle(renderer: Renderer): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await renderer.settle();
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
    const { container, ...renderer } = await renderTree(
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
    const { container, ...renderer } = await renderTree(
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
    const { container, ...renderer } = await renderTree((b) => {
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
    // The first page waits until the test has seen the loading state (a timer raced a busy machine).
    let openFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => (openFirst = resolve));
    const provider = async (request: GridItemsProviderRequest<Order>) => {
      requests.push(request);
      await (requests.length === 1 ? first : new Promise((resolve) => setTimeout(resolve, 5)));
      const rows = request.applySorting(orders).slice(request.startIndex, request.startIndex + request.count!);
      return { items: rows, totalItemCount: orders.length };
    };
    const { container, ...renderer } = await renderTree(
      grid({ itemsProvider: provider, pagination }, (b) => {
        component(b, 0, PropertyColumn, { property: customer, sortable: true, isDefaultSortColumn: true });
      }),
    );
    await renderer.settle();
    expect(container.querySelector("tbody")!.textContent).toContain("Loading…");
    expect(container.querySelector("table")!.getAttribute("aria-busy")).toBe("true");
    openFirst();
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

  it("offers the rows per page; a choice goes back to the first page and the provider loads the new size", async () => {
    const requests: GridItemsProviderRequest<Order>[] = [];
    const pagination = new PaginationState();
    pagination.itemsPerPage = 2;
    const provider = (request: GridItemsProviderRequest<Order>) => {
      requests.push(request);
      return { items: orders.slice(request.startIndex, request.startIndex + request.count!), totalItemCount: orders.length };
    };
    const { container, ...renderer } = await renderTree((b) => {
      component(b, 0, DataGrid, { itemsProvider: provider, pagination, childContent: ((inner: RenderTreeBuilder) => component(inner, 0, PropertyColumn, { property: customer })) as RenderFragment });
      component(b, 10, Paginator, { state: pagination, pageSizeOptions: [2, 4], pageSizeLabel: "Rows per page:" });
    });
    await settle(renderer);
    await pagination.setCurrentPageIndexAsync(1);
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Lena", "Ali"]);

    const select = container.querySelector("select")!;
    expect(select.closest("label")!.textContent).toContain("Rows per page:");
    expect([...select.options].map((option) => option.value)).toEqual(["2", "4"]);
    expect(select.value).toBe("2");
    select.value = "4";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Marta", "Jonas", "Lena", "Ali"]);
    expect(pagination.currentPageIndex).toBe(0);
    expect([requests.at(-1)!.startIndex, requests.at(-1)!.count]).toEqual([0, 4]);
    await expect(pagination.setItemsPerPageAsync(0)).rejects.toThrow(RangeError);
  });

  it("sorts a TemplateColumn by its sortKey alone through the ItemsProvider (the server orders by the name)", async () => {
    const requests: GridItemsProviderRequest<Order>[] = [];
    const provider = (request: GridItemsProviderRequest<Order>) => {
      requests.push(request);
      return { items: orders, totalItemCount: orders.length };
    };
    const { container, ...renderer } = await renderTree(
      grid({ itemsProvider: provider }, (b) => {
        component(b, 0, TemplateColumn, {
          title: "Customer",
          sortKey: "Customer",
          childContent: ((order: Order) => (inner: RenderTreeBuilder) => inner.addContent(0, order.customer)) as never,
        });
      }),
    );
    await settle(renderer);
    const sortButton = container.querySelector<HTMLButtonElement>("thead th button");
    expect(sortButton?.textContent).toContain("Customer");
    sortButton!.click();
    await settle(renderer);
    expect(requests.at(-1)!.getSortByProperties()).toEqual([{ propertyName: "Customer", direction: "ascending" }]);
    expect(container.querySelector("thead th")!.getAttribute("aria-sort")).toBe("ascending");
  });

  it("selects rows with checkboxes and reports them through selectedItemsChanged", async () => {
    let selected: Order[] = [];
    const { container, ...renderer } = await renderTree(
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
    const { container, ...renderer } = await renderTree(
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

  it("shows a column's options below its header when its options button is clicked; only one is open", async () => {
    const { container, ...renderer } = await renderTree(
      grid({ items: orders }, (b) => {
        component(b, 0, PropertyColumn, {
          property: customer,
          columnOptions: (inner: RenderTreeBuilder) => inner.addContent(0, "Filter customers"),
        });
        component(b, 10, PropertyColumn, {
          property: total,
          columnOptions: (inner: RenderTreeBuilder) => inner.addContent(0, "Filter totals"),
        });
      }),
    );
    await settle(renderer);

    const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("thead th .fui-datagrid__options")];
    expect(buttons().map((button) => button.getAttribute("aria-label"))).toEqual(["Column options", "Column options"]);
    expect(container.querySelector(".fui-datagrid__options-panel")).toBeNull();

    buttons()[0]!.click();
    await settle(renderer);
    expect(container.querySelector(".fui-datagrid__options-panel")!.textContent).toBe("Filter customers");
    expect(buttons()[0]!.getAttribute("aria-expanded")).toBe("true");
    expect(buttons()[1]!.getAttribute("aria-expanded")).toBe("false");

    buttons()[1]!.click();
    await settle(renderer);
    expect(container.querySelector(".fui-datagrid__options-panel")!.textContent).toBe("Filter totals");
    expect(buttons()[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(buttons()[1]!.getAttribute("aria-expanded")).toBe("true");

    buttons()[1]!.click();
    await settle(renderer);
    expect(container.querySelector(".fui-datagrid__options-panel")).toBeNull();
  });

  it("filters a column with the built-in filter (its apply clears on an empty value, its mark shows on the button)", async () => {
    const { container, ...renderer } = await renderTree(
      grid({ items: orders }, (b) => {
        component(b, 0, PropertyColumn, { property: customer, filterable: true });
        component(b, 10, PropertyColumn, { property: total });
      }),
    );
    await settle(renderer);
    const options = () => [...container.querySelectorAll<HTMLButtonElement>("thead th .fui-datagrid__options")];
    expect(options().length).toBe(1);
    options()[0]!.click();
    await settle(renderer);
    const apply = () => container.querySelector<HTMLButtonElement>(".fui-datagrid__filter-actions button:first-child")!;
    const clear = () => container.querySelector<HTMLButtonElement>(".fui-datagrid__filter-actions button:last-child")!;
    expect(apply()!.textContent!.trim()).toBe("Apply filter");
    expect(clear()!.textContent!.trim()).toBe("Clear filter");

    // "equals Marta": the rows filter to one, the options button marks the active filter.
    const select = container.querySelector<HTMLSelectElement>(".fui-datagrid__filter-operator")!;
    select.value = "equals";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    const input = container.querySelector<HTMLInputElement>(".fui-datagrid__filter-value")!;
    input.value = "Marta";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(renderer);
    apply()!.click();
    await settle(renderer);
    expect(texts(container, "tbody tr td:first-child")).toEqual(["Marta"]);
    expect(options()[0]!.className).toContain("fui-datagrid__options--active");

    clear()!.click();
    await settle(renderer);
    expect(texts(container, "tbody tr td:first-child")).toEqual(["Marta", "Jonas", "Lena", "Ali"]);
    expect(options()[0]!.className).not.toContain("fui-datagrid__options--active");
  });

  it("renders the dense table for density compact (and small, its alias)", async () => {
    const { container, ...renderer } = await renderTree(
      grid({ items: orders, density: "compact" }, (b) => component(b, 0, PropertyColumn, { property: customer })),
    );
    await settle(renderer);
    expect(container.querySelector("table")!.className).toContain("fui-table--compact");
  });

  it("collects the columns on every render: a column shown conditionally comes and goes", async () => {
    let showTotal = true;
    const { container, instance, ...renderer } = await renderTree(
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
    const { container, ...renderer } = await renderTree(
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
    const { container, ...renderer } = await renderTree(
      grid({ items: many, virtualize: true, itemSize: 40 }, (b) => {
        component(b, 0, PropertyColumn, { property: (o: Order) => o.id, sortable: true });
        component(b, 10, PropertyColumn, { property: customer, sortable: true });
      }),
    );
    await settle(renderer);
    const rows = [...container.querySelectorAll("tbody > tr")];
    // The spacers: the first and last rows, hidden from screen readers.
    expect(rows[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(rows.at(-1)!.getAttribute("aria-hidden")).toBe("true");
    const data = rows.slice(1, -1);
    // A test DOM has no layout: as with bUnit, the viewport reports a huge container, so the rows render up to
    // MaxItemCount (100) plus the overscan on both sides (3 each).
    expect(data.length).toBe(106);
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
    const { container, ...renderer } = await renderTree(
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

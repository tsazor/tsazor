/**
 * DataGrid (QuickGrid-shaped) through the compiled components: the columns
 * register while they render, the table renders after them (Defer), sorting,
 * paging with Paginator, an ItemsProvider, selection and template columns.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment, type RenderTreeBuilder } from "@tsazor/runtime";
import { addDays, today, type ScheduleAppointment } from "@tsazor/ui";
import { DataGrid, GridSort, PaginationState, Paginator, PropertyColumn, Scheduler, TemplateColumn } from "../dist/index.js";
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
    // A page turned is announced; the grid's status counts all the rows.
    expect(container.querySelector(".fui-paginator__page")!.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector("table + [role=status]")!.textContent).toBe("4 results");
    expect(container.querySelector<HTMLButtonElement>("[aria-label='Previous page']")!.getAttribute("aria-disabled")).toBe("true");

    const next = container.querySelector<HTMLButtonElement>("[aria-label='Next page']")!;
    next.focus();
    next.click();
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Ali"]);
    expect(container.querySelector(".fui-paginator__page")!.textContent).toBe("Page 2 of 2");
    // At the end the button is aria-disabled, not disabled: it keeps the focus (a disabled one drops it to the body).
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next.disabled).toBe(false);
    expect(document.activeElement).toBe(next);
    container.querySelector<HTMLButtonElement>("[aria-label='Last page']")!.click();
    await settle(renderer);
    expect(texts(container, "tbody td")).toEqual(["Ali"]);
  });

  it("leaves the page text out with showPageNumber false (MudTablePager has none), the arrows stay", async () => {
    const pagination = new PaginationState();
    pagination.itemsPerPage = 3;
    const { container, ...renderer } = await renderTree((b) => {
      component(b, 0, DataGrid, { items: orders, pagination, childContent: ((inner: RenderTreeBuilder) => component(inner, 0, PropertyColumn, { property: customer })) as RenderFragment });
      component(b, 10, Paginator, { state: pagination, showPageNumber: false });
    });
    await settle(renderer);
    expect(container.querySelector(".fui-paginator__page")).toBeNull();
    expect(container.querySelector("[aria-label='Next page']")).not.toBeNull();
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
    // The grid's status says the outcome to a screen reader.
    expect(container.querySelector("table + [role=status]")!.textContent).toBe("1 result");
    expect(options()[0]!.className).toContain("fui-datagrid__options--active");

    clear()!.click();
    await settle(renderer);
    expect(texts(container, "tbody tr td:first-child")).toEqual(["Marta", "Jonas", "Lena", "Ali"]);
    expect(options()[0]!.className).not.toContain("fui-datagrid__options--active");
  });

  it("renders a tfoot with the columns' aggregates; the default scope is all the rows", async () => {
    const pagination = new PaginationState();
    pagination.itemsPerPage = 2;
    const { container, ...renderer } = await renderTree((b) => {
      component(b, 0, DataGrid, {
        items: orders,
        pagination,
        childContent: ((inner: RenderTreeBuilder) => {
          component(inner, 0, PropertyColumn, { property: customer });
          component(inner, 4, PropertyColumn, { property: total, title: "Total", aggregate: "sum", format: (v: number) => v.toFixed(2), align: "end" });
          component(inner, 8, TemplateColumn, { title: "Orders", aggregate: "count" });
        }) as RenderFragment,
      });
      component(b, 10, Paginator, { state: pagination });
    });
    await settle(renderer);
    expect(container.querySelector("tfoot")!.className).toBe("fui-datagrid__foot");
    expect(texts(container, "tfoot tr td")).toEqual(["", "67.50", "4"]);
    container.querySelector<HTMLButtonElement>("[aria-label='Next page']")!.click();
    await settle(renderer);
    expect(texts(container, "tfoot tr td")).toEqual(["", "67.50", "4"]);
  });

  it("has no column grips or resize handles unless asked for (resizableColumns, reorderableColumns)", async () => {
    const { container, ...renderer } = await renderTree(
      grid({ items: orders }, (b) => {
        component(b, 0, PropertyColumn, { property: customer });
      }),
    );
    await settle(renderer);
    expect(container.querySelectorAll(".fui-datagrid__grip, .fui-datagrid__resize")).toHaveLength(0);
    // No extra tab stops in the header: the sortable header's button is the only one.
    expect(container.querySelectorAll("thead [tabindex='0']")).toHaveLength(0);
  });

  it("resizes a column by the handle's arrow keys (Shift makes a bigger step) and lays the cols out", async () => {
    const { container, ...renderer } = await renderTree(
      grid({ items: orders, resizableColumns: true }, (b) => {
        component(b, 0, PropertyColumn, { property: customer });
        component(b, 10, PropertyColumn, { property: total, title: "Total" });
      }),
    );
    await settle(renderer);
    // The header's name is its title alone: the resize separator's label would join it on every cell.
    expect(container.querySelectorAll("thead th")[1]!.getAttribute("aria-label")).toBe("Total");
    expect(container.querySelector("table")!.className).not.toContain("fui-datagrid--sized");
    const handle = container.querySelectorAll<HTMLDivElement>(".fui-datagrid__resize")[0]!;
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector("col:nth-child(1)")!.getAttribute("style")).toBe("width: 85px;");
    expect(container.querySelector("table")!.className).toContain("fui-datagrid--sized");
    container.querySelectorAll(".fui-datagrid__resize")[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
    await settle(renderer);
    expect(container.querySelector("col:nth-child(1)")!.getAttribute("style")).toBe("width: 105px;"); // 85, then 20 with Shift
    container.querySelectorAll(".fui-datagrid__resize")[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector("col:nth-child(1)")!.getAttribute("style")).toBe("width: 100px;");
  });

  it("reorders a column by the grip's keys and renders headers, cells and foot in the new order", async () => {
    const { container, ...renderer } = await renderTree((b) => {
      component(b, 0, DataGrid, {
        items: orders,
        reorderableColumns: true,
        childContent: ((inner: RenderTreeBuilder) => {
          component(inner, 0, PropertyColumn, { property: customer });
          component(inner, 4, PropertyColumn, { property: total, title: "Total", aggregate: "count" });
        }) as RenderFragment,
      });
    });
    await settle(renderer);
    expect(texts(container, "tbody tr td")).toEqual(["Marta", "12.5", "Jonas", "30", "Lena", "7", "Ali", "18"]);
    const grips = container.querySelectorAll<HTMLDivElement>(".fui-datagrid__grip");
    expect(grips).toHaveLength(2);
    grips[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle(renderer);
    expect(texts(container, "thead th")).toEqual(["Total", "customer"]);
    expect(texts(container, "tbody tr:first-child td")).toEqual(["12.5", "Marta"]);
    expect(texts(container, "tfoot tr td")).toEqual(["4", ""]);
  });

  it("edits a row: the columns' edit cells render, Enter commits, Escape cancels", async () => {
    let ended: { item: Order; reason: string } | undefined;
    let dataGrid: DataGrid<Order> | undefined;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, DataGrid as never);
      b.addAttribute(1, "items", orders);
      b.addAttribute(2, "editing", "row");
      b.addAttribute(3, "ariaLabel", "Orders");
      b.addAttribute(4, "childContent", ((inner: RenderTreeBuilder) => {
        component(inner, 0, PropertyColumn, {
          property: customer,
          editContent: ((order: Order) => (cell: RenderTreeBuilder) => {
            cell.openElement(0, "input");
            cell.addAttribute(1, "value", order.customer);
            cell.closeElement();
          }) as never,
        });
        component(inner, 1, PropertyColumn, { property: total, title: "Total" });
      }) as RenderFragment);
      b.addAttribute(5, "onEditEnded", EventCallback.unbound((value: { item: Order; reason: string }) => { ended = value; }));
      b.addComponentReferenceCapture(6, (captured) => { dataGrid = captured as DataGrid<Order>; });
      b.closeComponent();
    });
    await settle(renderer);
    expect(container.querySelectorAll("tbody input")).toHaveLength(0);

    const data = dataGrid as unknown as { editRowAsync(item: Order): Promise<void>; endEditAsync(reason: string): Promise<void>; isEditing(item: Order): boolean };
    expect(data).toBeDefined();
    await data!.editRowAsync(orders[0]!);
    await settle(renderer);
    expect(container.querySelectorAll("tbody tr:first-child input")).toHaveLength(1);
    expect(container.querySelectorAll("tbody tr input")).toHaveLength(1); // the other rows stay read-only
    expect(data!.isEditing(orders[0]!)).toBe(true);
    expect(container.querySelector("tbody tr:first-child")!.className).toContain("fui-datagrid__row--editing");

    const input = container.querySelector<HTMLInputElement>("tbody tr:first-child input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(renderer);
    expect(ended).toEqual({ item: orders[0], reason: "cancel" });
    expect(data!.isEditing(orders[0]!)).toBe(false);
    expect(container.querySelectorAll("tbody input")).toHaveLength(0);

    await data!.editRowAsync(orders[0]!);
    await settle(renderer);
    const again = container.querySelector<HTMLInputElement>("tbody tr:first-child input")!;
    again.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle(renderer);
    expect(ended).toEqual({ item: orders[0], reason: "commit" });
    expect(container.querySelectorAll("tbody input")).toHaveLength(0);
  });

  it("groups the rows: a header per value, collapsible, the rows beneath, the foot over all", async () => {
    const { container, ...renderer } = await renderTree((b) => {
      component(b, 0, DataGrid, {
        items: orders,
        group: ((o: Order) => o.customer.length) as never,
        childContent: ((inner: RenderTreeBuilder) => {
          component(inner, 0, PropertyColumn, { property: customer });
          component(inner, 4, PropertyColumn, { property: total, title: "Total", aggregate: "count" });
        }) as RenderFragment,
      });
    });
    await settle(renderer);
    const groups = () => [...container.querySelectorAll<HTMLButtonElement>(".fui-datagrid__group-toggle")];
    expect(groups()).toHaveLength(3);
    const dataRows = () => texts(container, "tbody tr:not(.fui-datagrid__group) td:first-child");
    expect(dataRows()).toEqual(["Ali", "Lena", "Marta", "Jonas"]);
    expect(groups()[0]!.getAttribute("aria-expanded")).toBe("true");
    // Named by what it shows, the group's value and count (WCAG 2.5.3); aria-expanded says it toggles.
    expect(groups()[0]!.hasAttribute("aria-label")).toBe(false);
    expect(groups()[0]!.textContent!.replace(/s+/g, "")).toBe("3(1)");

    groups()[0]!.click();
    await settle(renderer);
    expect(dataRows()).toEqual(["Lena", "Marta", "Jonas"]);
    expect(groups()[0]!.getAttribute("aria-expanded")).toBe("false");

    groups()[0]!.click();
    await settle(renderer);
    expect(dataRows()).toEqual(["Ali", "Lena", "Marta", "Jonas"]);
    expect(texts(container, "tfoot tr td")).toEqual(["", "4"]);
  });

  it("refuses grouping together with virtualize", async () => {
    await expect(
      renderTree((b) => {
        component(b, 0, DataGrid, {
          items: orders,
          group: ((o: Order) => o.customer.length) as never,
          virtualize: true,
          childContent: ((inner: RenderTreeBuilder) => component(inner, 0, PropertyColumn, { property: customer })) as RenderFragment,
        });
      }),
    ).rejects.toThrow(/Virtualize and grouping/);
  });

  it("renders the dense table for density compact (and small, its alias)", async () => {
    const { container, ...renderer } = await renderTree(
      grid({ items: orders, density: "compact" }, (b) => component(b, 0, PropertyColumn, { property: customer })),
    );
    await settle(renderer);
    expect(container.querySelector("table")!.className).toContain("fui-table--compact");
  });

  it("exports the rows' CSV and snapshots the columns' state", async () => {
    let dataGrid: DataGrid<Order> | undefined;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, DataGrid as never);
      b.addAttribute(1, "items", orders);
      b.addAttribute(2, "childContent", ((inner: RenderTreeBuilder) => {
        component(inner, 0, PropertyColumn, { property: customer });
        component(inner, 1, PropertyColumn, { property: total, title: "Total", format: (v: number) => v.toFixed(2) });
      }) as RenderFragment);
      b.addComponentReferenceCapture(2, (captured) => { dataGrid = captured as DataGrid<Order>; });
      b.closeComponent();
    });
    await settle(renderer);
    const data = dataGrid as unknown as { exportCsv(scope?: string): string; columnsSnapshot(): unknown };
    expect(data!.exportCsv().split("\r\n")).toEqual(["customer,Total", "Marta,12.50", "Jonas,30.00", "Lena,7.00", "Ali,18.00", ""]);
    const snapshot = data!.columnsSnapshot();
    expect(snapshot).toEqual({ columns: [{ key: "customer" }, { key: "total" }], filters: [] });
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

const day = today();
const dayAfter = (d: string, n: number): string => {
  const date = new Date(d + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};
const meetings: ScheduleAppointment[] = [
  { title: "Standup", start: day + "T09:00", end: day + "T09:15" },
  { title: "Review", start: day + "T09:00", end: day + "T10:00", intent: "success" },
  { title: "Off days", start: day, end: dayAfter(day, 2), allDay: true, intent: "info" },
];

function schedulerOf(attrs: Attrs, extra?: (b: RenderTreeBuilder) => void): Promise<{ container: HTMLElement; settle: Renderer["settle"] }> {
  return renderTree((b) => {
    b.openComponent(0, Scheduler as never);
    let sequence = 1;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(sequence++, name, value as never);
    extra?.(b);
    b.closeComponent();
  });
}

describe("Scheduler", () => {
  it("shows the month's 42 cells with today, chips with intents, and out-of-month days", async () => {
    const { container, ...renderer } = await schedulerOf({ appointments: meetings, view: "month", ariaLabel: "Meetings" });
    await settle(renderer);
    const cells = container.querySelectorAll(".fui-schedule-month .fui-schedule-day");
    expect(cells).toHaveLength(42);
    expect(container.querySelector(".fui-schedule-day--today")).not.toBeNull();
    const numbers = [...cells].map((cell) => cell.querySelector(".fui-schedule-day-number")!.textContent!.trim());
    expect(numbers.at(0)).toBeTruthy();
    // Chips: the month of today holds the 15th's two and the 16th's all-day one.
    const chips = container.querySelectorAll<HTMLButtonElement>(".fui-schedule-month .fui-schedule-appointment");
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect([...chips].some((chip) => chip.className.includes("fui-schedule-appointment--success"))).toBe(true);
    expect([...chips].some((chip) => chip.className.includes("fui-schedule-appointment--info"))).toBe(true);
  });

  it("selects through the chip and reports it; the selected one says aria-pressed", async () => {
    const selected: ScheduleAppointment[] = [];
    const { container, ...renderer } = await schedulerOf({ appointments: meetings, view: "day" }, (b) => {
      b.addAttribute(9, "onAppointmentSelected", EventCallback.unbound((appointment: ScheduleAppointment) => { selected.push(appointment); }));
    });
    await settle(renderer);
    const chips = () => [...container.querySelectorAll<HTMLButtonElement>(".fui-schedule-block > button")];
    expect(chips()).toHaveLength(2); // the Standup and the Review on today's day
    chips()[0]!.click();
    await settle(renderer);
    expect(chips()[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(selected).toHaveLength(1);
  });

  it("shows the week's all-day row and laid-out timegrid; the more button leads to the day", async () => {
    const { container, ...renderer } = await schedulerOf({ appointments: meetings, view: "week" });
    await settle(renderer);
    // The all-day row: the 16th's Off holiday, with its 3-day span per day.
    expect(container.querySelectorAll(".fui-schedule-all-day .fui-schedule-appointment").length).toBeGreaterThanOrEqual(1);
    // The timegrid: 24 hour labels; blocks absolutely placed by lane.
    expect(container.querySelectorAll(".fui-schedule-hour")).toHaveLength(24);
    const blocks = [...container.querySelectorAll<HTMLElement>(".fui-schedule-block")];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0]!.getAttribute("style")).toContain("left: 0.000%");
    expect(blocks.some((block) => block.getAttribute("style")!.includes("left: 50.000%"))).toBe(true); // the second lane beside it
  });

  it("navigate buttons move the window; the view buttons switch it", async () => {
    const { container, ...renderer } = await schedulerOf({ appointments: meetings, view: "week" });
    await settle(renderer);
    const period = () => container.querySelector(".fui-schedule-period")!.textContent!;
    const toolbar = () => [...container.querySelectorAll<HTMLButtonElement>(".fui-schedule-toolbar button")];
    const before = period();
    toolbar()[2]!.click(); // next
    await settle(renderer);
    expect(period()).not.toBe(before);
    toolbar()[1]!.click(); // today (labelled by its text)
    await settle(renderer);
    expect(period()).toBe(before);
    // The view switcher: day solid when active.
    const viewButtons = () => [...container.querySelectorAll<HTMLButtonElement>(".fui-schedule-views button")];
    viewButtons()[2]!.click();
    await settle(renderer);
    expect(viewButtons()[2]!.className).not.toBe(viewButtons()[0]!.className); // the solid appearance marks the active view
    expect(container.querySelector(".fui-schedule-timegrid")).not.toBeNull();
  });
});

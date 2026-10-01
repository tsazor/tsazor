/**
 * DataGrid (4.2): the templated grid builds header/body from a column list;
 * cells render `format(row)`/`String(row[field])` or the custom `cellContent`
 * template per (row, column). Built through the compiled dist pipeline.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import type { RenderTreeBuilder } from "@tsazor/runtime";
import { DataGrid } from "../dist/index.js";
import type { DataGridColumn } from "../src/datagrid-columns";

interface OrderRow {
  customer: string;
  total: number;
  placed: Date;
}

const ROWS: OrderRow[] = [
  { customer: "Alice", total: 42, placed: new Date("2026-01-02T00:00:00Z") },
  { customer: "Bruno", total: 17, placed: new Date("2026-01-05T00:00:00Z") },
  { customer: "Chiara", total: 99, placed: new Date("2026-01-09T00:00:00Z") },
];

const COLUMNS: DataGridColumn<OrderRow>[] = [
  { field: "customer", title: "Customer" },
  { field: "total", title: "Total (€)", align: "end" },
  { field: "placed", format: (row) => row.placed.toISOString().slice(0, 10) },
];

beforeAll(() => {
  document.body.innerHTML = "";
});

/** Renders one DataGrid; extra attributes ride through `addAttribute`. */
async function renderGrid(
  items: OrderRow[],
  columns: DataGridColumn<OrderRow>[],
  extra?: (b: RenderTreeBuilder) => void,
) {
  return renderTree((b) => {
    b.openComponent(0, DataGrid);
    b.addAttribute(1, "items", items);
    b.addAttribute(2, "columns", columns);
    extra?.(b);
    b.closeComponent();
  });
}

describe("DataGrid", () => {
  it("builds header and body from the columns (title, default field text, format)", async () => {
    const { container } = await renderGrid(ROWS, COLUMNS);
    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["Customer", "Total (€)", "placed"]);
    const rows = [...container.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent),
    );
    expect(rows).toEqual([
      ["Alice", "42", "2026-01-02"],
      ["Bruno", "17", "2026-01-05"],
      ["Chiara", "99", "2026-01-09"],
    ]);
    expect(container.querySelector("th[scope=col][aria-colindex]")).toBeNull();
  });

  it("aligns cells and headers per column (align: end/center)", async () => {
    const { container } = await renderGrid(ROWS, COLUMNS);
    const endHeader = [...container.querySelectorAll("thead th")][1]!;
    expect(endHeader.className).toContain("fui-datagrid__head--end");
    expect([...container.querySelectorAll("tbody tr")[0]!.querySelectorAll("td")][1]!.className).toContain(
      "fui-datagrid__cell--end",
    );
    expect(container.querySelector(".fui-datagrid__head--center")).toBeNull();
  });

  it("renders the row/cell template instead of formatted text", async () => {
    const { container } = await renderGrid(ROWS, COLUMNS.slice(0, 1), (b) => {
      b.addAttribute(3, "cellContent", ((row: OrderRow, _column: DataGridColumn<OrderRow>) => (b2: RenderTreeBuilder) =>
        b2.addContent(0, `mailto:${row.customer.toLowerCase()}`)) as never);
    });
    expect(container.querySelector("tbody td")!.textContent).toBe("mailto:alice");
  });

  it("marks the empty state and carries the table modifiers", async () => {
    const { container } = await renderGrid([], COLUMNS, (b) => {
      b.addAttribute(3, "striped", true);
      b.addAttribute(4, "hover", true);
      b.addAttribute(5, "emptyText", "Nothing here");
    });
    expect(container.querySelector(".fui-table__empty")!.textContent).toBe("Nothing here");
    expect(container.querySelector("table")!.className).toBe("fui-table fui-datagrid fui-table--striped fui-table--hover");
  });

  it("captures unmatched @attributes on the table element (4.2)", async () => {
    const { container } = await renderGrid(ROWS, COLUMNS, (b) => {
      b.addAttribute(3, "class", "orders-grid");
      b.addAttribute(4, "data-testid", "orders");
    });
    const table = container.querySelector("table")!;
    expect(table.getAttribute("data-testid")).toBe("orders");
    expect(table.className).toContain("orders-grid");
    expect(table.getAttribute("role")).toBe("table");
  });
});
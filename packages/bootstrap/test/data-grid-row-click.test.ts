/**
 * A DataGrid's row click (Fluent UI Blazor's OnRowClick, MudDataGrid's RowClick) and its rows' own class and style
 * (RowClass, RowStyle): the row's item on a click in a cell, nothing on a click on a control in the row.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment, type RenderTreeBuilder } from "@tsazor/runtime";
import { DataGrid, DetailsColumn, PropertyColumn } from "../dist/index.js";

interface Run {
  id: number;
  status: "ok" | "failed";
}

const runs: Run[] = [
  { id: 41, status: "ok" },
  { id: 42, status: "failed" },
];

function component(b: RenderTreeBuilder, seq: number, type: unknown, attrs: Record<string, unknown>): void {
  b.openComponent(seq, type as never);
  let n = seq + 1;
  for (const [name, value] of Object.entries(attrs)) b.addAttribute(n++, name, value);
  b.closeComponent();
}

async function renderGrid(attrs: Record<string, unknown>) {
  const result = await renderTree((b) => {
    component(b, 0, DataGrid, {
      ariaLabel: "Runs",
      items: runs,
      selectionMode: "multiple",
      detailContent: (run: Run): RenderFragment => (inner) => inner.addContent(0, `Steps of ${run.id}`),
      ...attrs,
      childContent: ((inner: RenderTreeBuilder) => {
        component(inner, 0, DetailsColumn, { rowName: (run: Run) => `run ${run.id}` });
        component(inner, 4, PropertyColumn, { property: (run: Run) => run.id });
      }) as RenderFragment,
    });
  });
  await result.settle();
  const rows = () => [...result.container.querySelectorAll<HTMLTableRowElement>("tbody > tr")];
  return { ...result, rows };
}

describe("DataGrid row click", () => {
  it("raises onRowClick with the row's item from a cell, not from a button or a checkbox in the row", async () => {
    const clicked: number[] = [];
    const { rows, settle } = await renderGrid({ onRowClick: EventCallback.unbound((run: Run) => void clicked.push(run.id)) });
    rows()[1]!.querySelectorAll("td")[2]!.click();
    await settle();
    expect(clicked).toEqual([42]);
    rows()[0]!.querySelector<HTMLButtonElement>("button")!.click();
    rows()[0]!.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    await settle();
    expect(clicked).toEqual([42]);
    expect(rows()[0]!.classList.contains("tz-grid-row-clickable")).toBe(true);
  });

  it("without onRowClick a row is no clickable row", async () => {
    const { rows } = await renderGrid({});
    expect(rows()[0]!.classList.contains("tz-grid-row-clickable")).toBe(false);
  });

  it("rowClass and rowStyle come from the item, next to the grid's own classes", async () => {
    const { rows } = await renderGrid({
      rowClass: (run: Run) => (run.status === "failed" ? "run-failed" : null),
      rowStyle: (run: Run) => (run.status === "failed" ? "font-weight: 600" : undefined),
      selectedItems: [runs[1]],
    });
    const [ok, failed] = rows();
    expect(ok!.classList.contains("run-failed")).toBe(false);
    expect(ok!.hasAttribute("style")).toBe(false);
    expect(failed!.classList.contains("run-failed")).toBe(true);
    expect(failed!.classList.length).toBeGreaterThan(1);
    expect(failed!.getAttribute("style")).toBe("font-weight: 600");
  });
});

/** The DataGrid core's detail rows (B44): open by the grid's row key, one at a time in single mode, a stable id each. */
import { describe, expect, it } from "vitest";
import { DataGridModel } from "../src/data-grid";

interface Order {
  id: number;
}

describe("DataGridModel details", () => {
  it("opens and closes a row's details by its key, and tells the grid to render", () => {
    let renders = 0;
    const model = new DataGridModel<Order>(() => renders++);
    model.configureDetails({ key: (order) => order.id, single: false });
    model.toggleDetails({ id: 1 });
    model.toggleDetails({ id: 2 });
    // A fresh object with the same key is the same row.
    expect([model.isDetailsOpen({ id: 1 }), model.isDetailsOpen({ id: 2 }), model.isDetailsOpen({ id: 3 })]).toEqual([true, true, false]);
    model.toggleDetails({ id: 1 });
    expect(model.isDetailsOpen({ id: 1 })).toBe(false);
    model.closeAllDetails();
    expect(model.isDetailsOpen({ id: 2 })).toBe(false);
    expect(renders).toBe(4);
  });

  it("keeps one row's details open at a time in single mode", () => {
    const model = new DataGridModel<Order>(() => undefined);
    model.configureDetails({ key: (order) => order.id, single: true });
    model.toggleDetails({ id: 1 });
    model.toggleDetails({ id: 2 });
    expect([model.isDetailsOpen({ id: 1 }), model.isDetailsOpen({ id: 2 })]).toEqual([false, true]);
  });

  it("gives a row's detail row the same id every time, a different one for another row", () => {
    const model = new DataGridModel<Order>(() => undefined);
    const first = { id: 1 };
    expect(model.detailsId(first)).toBe(model.detailsId(first));
    expect(model.detailsId(first)).not.toBe(model.detailsId({ id: 1 }));
    model.configureDetails({ key: (order) => `order ${order.id}`, single: false });
    expect(model.detailsId({ id: 1 })).toBe(model.detailsId({ id: 1 }));
    expect(model.detailsId({ id: 1 })).toMatch(/-order_1$/);
  });
});

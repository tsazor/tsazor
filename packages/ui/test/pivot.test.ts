/**
 * The pivot's model (design-extended-library.md §2.5): the matrix, the
 * measure's aggregates, the totals, and the orders.
 */
import { describe, expect, it } from "vitest";
import { PivotModel, type PivotMeasure, type PivotMatrix } from "../src/index";

interface Sale {
  region: string;
  quarter: string;
  amount: number;
  missing?: true;
}

const sales: Sale[] = [
  { region: "North", quarter: "Q1", amount: 100 },
  { region: "North", quarter: "Q2", amount: 50 },
  { region: "South", quarter: "Q1", amount: 75 },
  { region: "North", quarter: "Q1", amount: 25 }, // a second cell's value for North/Q1
  { region: "South", quarter: "Q3", amount: null }, // a null measure: the cell has no numbers
];

const amounts: PivotMeasure<Sale> = { value: (sale) => sale.amount };

describe("PivotModel", () => {
  it("computes the matrix: cells, row totals, column totals, the grand total", () => {
    const pivot = new PivotModel<Sale>({ rows: (sale) => sale.region, columns: (sale) => sale.quarter, measure: amounts });
    const matrix = pivot.compute(sales);
    expect(matrix.columns).toEqual(["Q1", "Q2", "Q3"]);
    expect(matrix.rows.map((row) => row.value)).toEqual(["North", "South"]);
    expect(matrix.rows[0]!.cells).toEqual([125, 50, undefined]); // North: Q1 100+25, Q2 50, Q3 nothing
    expect(matrix.rows[0]!.total).toBe(175);
    expect(matrix.rows[1]!.cells).toEqual([75, undefined, undefined]); // South's Q3 holds only a null
    expect(matrix.rows[1]!.total).toBe(75);
    void matrix;
    expect(matrix.totals.cells).toEqual([200, 50, undefined]);
    expect(matrix.totals.grand).toBe(250);
  });

  it("without a column field, pivots over one column", () => {
    const pivot = new PivotModel<Sale>({ rows: (sale) => sale.region, measure: { ...amounts, aggregate: "count" } });
    const matrix = pivot.compute(sales);
    expect(matrix.columns).toEqual([""]);
    expect(matrix.rows.map((row) => [row.value, row.total, row.cells[0]])).toEqual([["North", 3, 3], ["South", 2, 2]]);
    expect(matrix.totals.grand).toBe(5);
  });

  it("aggregates: avg, min, max, count, and a custom one", () => {
    const count = new PivotModel<Sale>({ rows: (sale) => sale.quarter, measure: { ...amounts, aggregate: "count" } }).compute(sales);
    expect(count.rows.map((row) => row.total)).toEqual([3, 1, 1]); // Q1 3, Q2 1, Q3 1
    const avg = new PivotModel<Sale>({ rows: (sale) => sale.quarter, measure: { ...amounts, aggregate: "avg" } }).compute(sales);
    expect(avg.rows[0]!.total).toBe((100 + 25 + 75) / 3);
    const min = new PivotModel<Sale>({ rows: (sale) => sale.region, measure: { ...amounts, aggregate: "min" } }).compute(sales);
    expect(min.rows[0]!.total).toBe(25);
    const max = new PivotModel<Sale>({ rows: (sale) => sale.region, measure: { ...amounts, aggregate: "max" } }).compute(sales);
    expect(max.rows[0]!.total).toBe(100);
    const custom = new PivotModel<Sale>({ rows: (sale) => sale.region, measure: { ...amounts, aggregate: (values) => values.length * 10 } }).compute(sales);
    expect(custom.rows[0]!.total).toBe(30);
    void count;
    void avg;
    void min;
    void max;
    void custom;
  });

  it("orders the dimensions in the collator's order and formats through the measure", () => {
    const pivot = new PivotModel<Sale>({ rows: (sale) => sale.quarter, columns: (sale) => sale.region, measure: { ...amounts, format: (value) => (value === undefined ? "–" : `€${value.toFixed(2)}`) } });
    const matrix = pivot.compute(sales);
    expect(matrix.rows.map((row) => row.value)).toEqual(["Q1", "Q2", "Q3"]);
    expect(pivot.format(matrix.rows[2]!.cells[0])).toBe("–"); // Q3's North holds nothing
    expect(pivot.format(matrix.rows[0]!.cells[1])).toBe("€75.00"); // Q1's South
  });

  it("keeps the compute stateless: two datas of one model", () => {
    const pivot = new PivotModel<Sale>({ rows: (sale) => sale.region, columns: (sale) => sale.quarter, measure: amounts });
    const second: Sale[] = [...sales, { region: "West", quarter: "Q1", amount: 9 }];
    const first = pivot.compute(sales);
    const matrix = pivot.compute(second);
    expect(first.rows).toHaveLength(2);
    expect(matrix.rows).toHaveLength(3);
    const matrix2: PivotMatrix = matrix;
    expect(matrix2.rows[2]!.value).toBe("West");
  });
});
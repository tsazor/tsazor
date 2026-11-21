/**
 * PivotDataGrid over the compiled components: a matrix rendered as grid rows
 * (the sort by a cell's column included), the totals in the footer.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import type { RenderTreeBuilder, RenderFragment } from "@tsazor/runtime";
import { PivotDataGrid } from "../dist/index.js";
import type { PivotMeasure } from "@tsazor/ui";

const sales = [
    { region: "North", quarter: "Q1", amount: 100 },
    { region: "North", quarter: "Q2", amount: 50 },
    { region: "South", quarter: "Q1", amount: 75 },
    { region: "North", quarter: "Q1", amount: 25 },
    { region: "South", quarter: "Q3", amount: null },
];

let mounted: RenderResult[] = [];
afterEach(() => {
    for (const result of mounted.splice(0)) result.dispose();
    document.body.innerHTML = "";
});

async function settle(result: RenderResult): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await result.settle();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe("PivotDataGrid", () => {
    it("renders the matrix as its rows; the sort by a cell column; the totals in the footer", async () => {
        mounted.push(await renderTree((b: RenderTreeBuilder) => {
            b.openComponent(0, PivotDataGrid as never);
            b.addAttribute(1, "data", sales);
            b.addAttribute(2, "rowField", (sale: (typeof sales)[number]) => sale.region);
            b.addAttribute(3, "rowTitle", "Region");
            b.addAttribute(4, "columnField", (sale: (typeof sales)[number]) => sale.quarter);
            b.addAttribute(5, "columnName", (value: unknown) => `Quarter ${value}`);
            b.addAttribute(6, "measure", { value: (sale: (typeof sales)[number]) => sale.amount, format: (value: number | null | undefined) => (value === undefined ? "–" : value.toFixed(2)) } satisfies PivotMeasure<(typeof sales)[number]>);
            b.addAttribute(7, "ariaLabel", "Sales by region and quarter");
            b.closeComponent();
        }));
        const result = mounted.at(-1)!;
        await settle(result);
        const container = result.container;
        expect([...container.querySelectorAll("thead th")].map((th) => th.textContent!.trim())).toEqual(["Region", "Quarter Q1", "Quarter Q2", "Quarter Q3", "Total"]);

        // The sort by a cell's column: Q2's header sorts the empty cell first with its numbers.
        const headers = () => [...container.querySelectorAll<HTMLElement>("thead th")];
        const sorted = () => [...container.querySelectorAll("tbody tr td:first-child")].map((cell) => cell.textContent!.trim());
        expect(sorted()).toEqual(["North", "South"]);
        headers()[2]!.querySelector("button")!.click();
        await settle(result);
        expect(sorted()).toEqual(["South", "North"]); // no numbers before numbers
        // The footer: the column totals, with the grand total on the totals' column.
        expect([...container.querySelectorAll("tfoot tr td")].map((cell) => cell.textContent!.trim())).toEqual(["", "200.00", "50.00", "", "250.00"]); // an empty column has no total
    });
});
/**
 * Chart (MudBlazor's MudChart) and Sparkline: what each draws, the words a screen reader gets, the table, choosing a
 * series or a slice, hiding a series.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, CultureService, EventCallback, StringLocalizer, type RenderTreeBuilder } from "@tsazor/runtime";
import { Chart, Sparkline } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const loaves = [
  { name: "Rye", data: [120, 98, 134, 110, 156, 182] },
  { name: "Spelt", data: [40, 52, 38, 61, 75, 70] },
];

async function chart(attrs: Record<string, unknown>): Promise<HTMLElement> {
  const result = await renderTree((b) => {
    b.openComponent(0, Chart);
    let seq = 1;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
    b.closeComponent();
  });
  mounted.push(result);
  await result.settle();
  return result.container.querySelector<HTMLElement>("figure")!;
}

describe("Chart", () => {
  it("line: an image named and described in words, a line and points per series, the axis's round ticks", async () => {
    const figure = await chart({ chartType: "line", chartSeries: loaves, chartLabels: week, ariaLabel: "Loaves this week" });
    const svg = figure.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("title")!.textContent).toBe("Loaves this week");
    expect(svg.querySelector("desc")!.textContent).toBe("Line chart: Rye from 98 to 182; Spelt from 38 to 75, over Mon to Sat.");
    expect(svg.querySelectorAll(".tz-chart__line")).toHaveLength(2);
    expect(svg.querySelectorAll(".tz-chart__point")).toHaveLength(12);
    expect([...svg.querySelectorAll(".tz-chart__tick")].slice(0, 5).map((tick) => tick.textContent)).toEqual(["0", "50", "100", "150", "200"]);
    expect(svg.querySelector(".tz-chart__point title")!.textContent).toBe("Rye, Mon: 120");
    expect(svg.querySelector(".tz-chart__axes")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("the numbers in a table, the legend, the skin's colors", async () => {
    const figure = await chart({ chartType: "bar", chartSeries: loaves, chartLabels: week, ariaLabel: "Loaves" });
    const rows = [...figure.querySelectorAll("tbody tr")].map((row) => row.textContent);
    expect(rows[0]).toBe("Mon12040");
    expect(figure.querySelector("caption")!.textContent).toBe("Loaves");
    expect([...figure.querySelectorAll(".tz-chart__legend-item")].map((item) => item.textContent?.trim())).toEqual(["Rye", "Spelt"]);
    expect(figure.querySelectorAll(".tz-chart__bar")).toHaveLength(12);
    expect((figure.querySelector(".tz-chart__series") as HTMLElement).getAttribute("style")).toBe("--tz-chart-color: var(--tz-chart-1)");
  });

  it("stacked bars stand on each other; an area fills below its line", async () => {
    const stacked = await chart({ chartType: "stacked-bar", chartSeries: loaves, chartLabels: week });
    const [rye, spelt] = [...stacked.querySelectorAll(".tz-chart__series")].map((series) => series.querySelector("rect")!);
    expect(Number(spelt!.getAttribute("y")) + Number(spelt!.getAttribute("height"))).toBeCloseTo(Number(rye!.getAttribute("y")), 1);
    const area = await chart({ chartType: "area", chartSeries: loaves.slice(0, 1), chartLabels: week });
    expect(area.querySelector(".tz-chart__area")!.getAttribute("d")!.endsWith("Z")).toBe(true);
  });

  it("donut: a slice per label with its share; the legend names them", async () => {
    const figure = await chart({ chartType: "donut", chartSeries: [{ name: "Sales", data: [30, 10] }], chartLabels: ["Bread", "Rolls"], ariaLabel: "Sales" });
    expect(figure.querySelector("desc")!.textContent).toBe("Donut chart of Sales: Bread 30 (75%), Rolls 10 (25%).");
    expect([...figure.querySelectorAll(".tz-chart__slice title")].map((title) => title.textContent)).toEqual(["Bread 30 (75%)", "Rolls 10 (25%)"]);
    expect([...figure.querySelectorAll(".tz-chart__legend-item")].map((item) => item.textContent?.trim())).toEqual(["Bread", "Rolls"]);
  });

  it("with @bind-selectedIndex the series are buttons the keyboard chooses; the others dim", async () => {
    class Host extends ComponentBase {
      static last: Host | undefined;
      selected = -1;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        Host.last = this;
        b.openComponent(0, Chart);
        b.addAttribute(1, "chartType", "line");
        b.addAttribute(2, "chartSeries", loaves);
        b.addAttribute(3, "chartLabels", week);
        b.addAttribute(4, "selectedIndex", this.selected);
        b.addAttribute(5, "selectedIndexChanged", EventCallback.bind(this, (index: number) => {
          this.selected = index;
        }));
        b.closeComponent();
      }
    }
    const result = await render(Host);
    mounted.push(result);
    const svg = result.container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("group");
    const series = () => [...svg.querySelectorAll<HTMLElement>(".tz-chart__series")];
    expect(series().map((s) => s.getAttribute("aria-label"))).toEqual(["Rye from 98 to 182", "Spelt from 38 to 75"]);
    series()[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await result.settle();
    expect(Host.last!.selected).toBe(1);
    expect(series()[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(series()[0]!.getAttribute("class")).toContain("tz-chart--dimmed");
    series()[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await result.settle();
    expect(Host.last!.selected).toBe(-1);
  });

  it("canHideSeries: the legend's checkboxes hide a series, and the words follow", async () => {
    const result = await renderTree((b) => {
      b.openComponent(0, Chart);
      b.addAttribute(1, "chartSeries", loaves);
      b.addAttribute(2, "chartLabels", week);
      b.addAttribute(3, "canHideSeries", true);
      b.closeComponent();
    });
    mounted.push(result);
    await result.settle();
    const boxes = [...result.container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((box) => box.checked)).toEqual([true, true]);
    boxes[0]!.click();
    await result.settle();
    expect(result.container.querySelectorAll(".tz-chart__series")).toHaveLength(1);
    expect(result.container.querySelector("desc")!.textContent).toBe("Line chart: Spelt from 38 to 75, over Mon to Sat.");
  });

  it("formats the values, and takes a palette and a step", async () => {
    const figure = await chart({
      chartType: "line",
      chartSeries: loaves.slice(0, 1),
      chartLabels: week,
      chartOptions: { yAxisFormat: (value: number) => `${value} pcs`, yAxisTicks: 100, chartPalette: ["#ff0000"] },
    });
    expect([...figure.querySelectorAll(".tz-chart__tick")].slice(0, 2).map((tick) => tick.textContent)).toEqual(["0 pcs", "100 pcs"]);
    expect((figure.querySelector(".tz-chart__series") as HTMLElement).getAttribute("style")).toBe("--tz-chart-color: #ff0000");
  });
});

describe("Sparkline", () => {
  it("a small line, its last value marked, named with where it goes", async () => {
    const result = await renderTree((b) => {
      b.openComponent(0, Sparkline);
      b.addAttribute(1, "data", [98, 182, 150]);
      b.addAttribute(2, "ariaLabel", "Loaves");
      b.closeComponent();
    });
    mounted.push(result);
    await result.settle();
    const svg = result.container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Loaves: from 98 to 182, now 150");
    expect(svg.querySelector(".tz-sparkline__line")!.getAttribute("d")!.startsWith("M3,")).toBe(true);
    expect(svg.querySelector(".tz-sparkline__dot")!.getAttribute("cx")).toBe("97");
  });
});

describe("the charts' texts and numbers (library texts, the culture)", () => {
  const GERMAN = {
    "tsazor.ui.chart.label": "Diagramm",
    "tsazor.ui.chart.table": "Die Daten",
    "tsazor.ui.chart.bar": "Balkendiagramm",
    "tsazor.ui.chart.range": "{series} von {low} bis {high}",
    "tsazor.ui.chart.summaryOver": "{chart}: {parts}, von {first} bis {last}.",
    "tsazor.ui.sparkline.summary": "{label}: von {low} bis {high}, zuletzt {last}",
  };

  it("speak the culture's language and write its numbers, as the skins' texts do", async () => {
    const culture = new CultureService("de-DE");
    const localizer = new StringLocalizer({ culture, defaultCulture: "en", tables: { de: GERMAN } });
    const result = await renderTree(
      (b) => {
        b.openComponent(0, Chart);
        b.addAttribute(1, "chartType", "bar");
        b.addAttribute(2, "chartSeries", [{ name: "Umsatz", data: [1234.5, 2000] }]);
        b.addAttribute(3, "chartLabels", ["Mo", "Di"]);
        b.closeComponent();
        b.openComponent(4, Sparkline);
        b.addAttribute(5, "data", [1.5, 2.25]);
        b.addAttribute(6, "ariaLabel", "Brote");
        b.closeComponent();
      },
      {
        services: (services) => {
          services.registerValue(CultureService as never, culture);
          services.registerValue(StringLocalizer as never, localizer);
        },
      },
    );
    mounted.push(result);
    await result.settle();
    const figure = result.container.querySelector("figure")!;
    expect(figure.querySelector("title")!.textContent).toBe("Diagramm");
    expect(figure.querySelector("summary")!.textContent).toBe("Die Daten");
    expect(figure.querySelector("desc")!.textContent).toBe("Balkendiagramm: Umsatz von 1.234,5 bis 2.000, von Mo bis Di.");
    expect(result.container.querySelector(".tz-sparkline")!.getAttribute("aria-label")).toBe("Brote: von 1,5 bis 2,25, zuletzt 2,25");
  });
});

/**
 * Chart.js on a canvas through `@attach` (docs/guide-charts.md). The attachment creates the chart when the canvas is
 * in the page and destroys it when the canvas leaves; `update` gives it new data without starting over, so it
 * animates. Chart.js loads with the first chart, so pages without one don't carry it. The colors come from CSS
 * custom properties on the canvas (`--chart-bar`, `--chart-grid`, and `color` for the text), so the skin and the
 * color scheme decide them; a change of the scheme recolors the chart. With reduced motion asked for, it doesn't
 * animate.
 */
import type { Attachment } from "@tsazor/runtime";
import type { Chart } from "chart.js";

/** One series of bars. */
export interface BarSeries {
  readonly label: string;
  readonly labels: readonly string[];
  readonly values: readonly number[];
}

/** A bar chart that an `@attach` puts on a canvas: `<canvas @attach="sales.attach">`. */
export class BarChart {
  #chart?: Chart<"bar">;
  #series: BarSeries;

  constructor(series: BarSeries) {
    this.#series = series;
  }

  readonly attach: Attachment<HTMLCanvasElement> = (canvas) => {
    let attached = true;
    void import("chart.js").then(({ Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip }) => {
      if (!attached) return;
      Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
      this.#chart = new Chart(canvas, {
        type: "bar",
        data: this.#data(canvas),
        options: { ...this.#options(canvas), maintainAspectRatio: false },
      });
    });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const recolor = (): void => {
      if (this.#chart === undefined) return;
      this.#chart.data = this.#data(canvas);
      this.#chart.options = { ...this.#options(canvas), maintainAspectRatio: false };
      this.#chart.update();
    };
    scheme.addEventListener("change", recolor);
    return () => {
      attached = false;
      scheme.removeEventListener("change", recolor);
      this.#chart?.destroy();
      this.#chart = undefined;
    };
  };

  /** New data for the chart in the page (or for the next one, if none is). */
  update(series: BarSeries): void {
    this.#series = series;
    const chart = this.#chart;
    if (chart === undefined) return;
    chart.data.labels = [...series.labels];
    const dataset = chart.data.datasets[0];
    if (dataset !== undefined) {
      dataset.label = series.label;
      dataset.data = [...series.values];
    }
    chart.update();
  }

  #data(canvas: HTMLCanvasElement): Chart<"bar">["data"] {
    const style = getComputedStyle(canvas);
    return {
      labels: [...this.#series.labels],
      datasets: [{ label: this.#series.label, data: [...this.#series.values], backgroundColor: style.getPropertyValue("--chart-bar").trim(), borderRadius: 4 }],
    };
  }

  #options(canvas: HTMLCanvasElement): NonNullable<Chart<"bar">["options"]> {
    const style = getComputedStyle(canvas);
    const text = style.color;
    const grid = style.getPropertyValue("--chart-grid").trim();
    return {
      color: text,
      scales: {
        x: { ticks: { color: text }, grid: { display: false } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true },
      },
      plugins: { tooltip: { enabled: true } },
      ...(matchMedia("(prefers-reduced-motion: reduce)").matches ? { animation: false as const } : {}),
    };
  }
}

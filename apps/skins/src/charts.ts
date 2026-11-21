/**
 * Chart.js on a canvas through `@attach` (docs/guide-charts.md). The attachment creates the chart when the canvas is
 * in the page and destroys it when the canvas leaves; `update` gives it new data without starting over, so it
 * animates — or, for a live chart, draws at once. Chart.js loads with the first chart, so pages without one don't
 * carry it. The colors come from CSS custom properties on the canvas (`--chart-color`, `--chart-grid`, and `color`
 * for the text), so the skin and the color scheme decide them; a change of the scheme recolors the chart. With
 * reduced motion asked for, it doesn't animate.
 */
import type { Attachment } from "@tsazor/runtime";
import type { Chart } from "chart.js";

/** One series: a label per value. */
export interface Series {
  readonly label: string;
  readonly labels: readonly string[];
  readonly values: readonly number[];
}

export interface SeriesChartOptions {
  /** Bars that compare (the default, from zero) or a line that follows a value (fitted to the data). */
  readonly type?: "bar" | "line";
  /** Data that streams in: each update draws at once instead of animating from the last one. */
  readonly live?: boolean;
}

/** A chart of one series that an `@attach` puts on a canvas: `<canvas @attach="sales.attach">`. */
export class SeriesChart {
  #chart?: Chart<"bar" | "line">;
  #series: Series;
  readonly #type: "bar" | "line";
  readonly #live: boolean;

  constructor(series: Series, options: SeriesChartOptions = {}) {
    this.#series = series;
    this.#type = options.type ?? "bar";
    this.#live = options.live ?? false;
  }

  readonly attach: Attachment<HTMLCanvasElement> = (canvas) => {
    let attached = true;
    void import("chart.js").then(({ Chart, BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip }) => {
      if (!attached) return;
      // Only the parts this chart draws: the bundle keeps the rest out.
      Chart.register(CategoryScale, LinearScale, Tooltip, ...(this.#type === "bar" ? [BarController, BarElement] : [LineController, LineElement, PointElement]));
      this.#chart = new Chart(canvas, { type: this.#type, data: this.#data(canvas), options: this.#options(canvas) });
    });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const recolor = (): void => {
      if (this.#chart === undefined) return;
      this.#chart.data = this.#data(canvas);
      this.#chart.options = this.#options(canvas);
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
  update(series: Series): void {
    this.#series = series;
    const chart = this.#chart;
    if (chart === undefined) return;
    chart.data.labels = [...series.labels];
    const dataset = chart.data.datasets[0];
    if (dataset !== undefined) {
      dataset.label = series.label;
      dataset.data = [...series.values];
    }
    chart.update(this.#live ? "none" : undefined);
  }

  #data(canvas: HTMLCanvasElement): Chart<"bar" | "line">["data"] {
    const color = getComputedStyle(canvas).getPropertyValue("--chart-color").trim();
    const look = this.#type === "bar"
      ? { backgroundColor: color, borderRadius: 4 }
      : { borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, tension: 0.3 };
    return {
      labels: [...this.#series.labels],
      datasets: [{ label: this.#series.label, data: [...this.#series.values], ...look }],
    };
  }

  #options(canvas: HTMLCanvasElement): NonNullable<Chart<"bar" | "line">["options"]> {
    const style = getComputedStyle(canvas);
    const text = style.color;
    const grid = style.getPropertyValue("--chart-grid").trim();
    const still = this.#live || matchMedia("(prefers-reduced-motion: reduce)").matches;
    return {
      color: text,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: text }, grid: { display: false } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: this.#type === "bar" },
      },
      plugins: { tooltip: { enabled: true } },
      ...(still ? { animation: false as const } : {}),
    };
  }
}

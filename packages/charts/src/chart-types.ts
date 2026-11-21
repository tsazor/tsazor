/**
 * The data and the options of a Chart (MudBlazor's MudChart, its newer API: ChartSeries, ChartLabels, ChartOptions).
 */

/** What a Chart draws (MudBlazor's `ChartType`). */
export type ChartType = "line" | "area" | "bar" | "stacked-bar" | "donut" | "pie";

/** One series: its name and a value per label (MudBlazor's `ChartSeries`). */
export interface ChartSeries {
  readonly name: string;
  readonly data: readonly number[];
  /**
   * A category per point, in the order of `data` ("OK", "Warning", "Failure"): a bar or a point takes its category's
   * color (`ChartOptions.categoryColors`), the legend lists the categories, and the hover title and the table name
   * each point's category — so the color is never the only way to tell them apart. A point without one keeps the
   * series' color. Bar, stacked-bar, line and area charts.
   */
  readonly categories?: readonly (string | undefined)[];
}

/** How a Chart draws (MudBlazor's `ChartOptions`; a .NET format string is a function here). */
export interface ChartOptions {
  /** The value axis's step between ticks (`YAxisTicks`); by default a round one. */
  readonly yAxisTicks?: number;
  /** The most ticks on the value axis (`MaxNumYAxisTicks`, 6). */
  readonly maxNumYAxisTicks?: number;
  /** The value axis's lowest value; by default zero or below. */
  readonly yAxisMin?: number;
  /** The value axis's highest value (`YAxisSuggestedMax`). */
  readonly yAxisSuggestedMax?: number;
  /** A value as the axis, the table and the summary write it (`YAxisFormat`, `YAxisToStringFunc`). */
  readonly yAxisFormat?: (value: number) => string;
  /** Lines across the chart at the ticks (`YAxisLines`, default true). */
  readonly yAxisLines?: boolean;
  /** Lines up the chart at the labels (`XAxisLines`). */
  readonly xAxisLines?: boolean;
  /** The value axis's title (`YAxisTitle`). */
  readonly yAxisTitle?: string;
  /** The label axis's title (`XAxisTitle`). */
  readonly xAxisTitle?: string;
  /** Lines straight from point to point (default) or smooth (`InterpolationOption`: NaturalSpline). */
  readonly interpolation?: "straight" | "smooth";
  /** A line's width (`LineStrokeWidth`, 3). */
  readonly lineStrokeWidth?: number;
  /** The legend below or beside the chart (`ShowLegend`, default true). */
  readonly showLegend?: boolean;
  /** The colors of the series or slices, in order (`ChartPalette`); by default the skin's. */
  readonly chartPalette?: readonly string[];
  /**
   * The colors of the categories (`ChartSeries.categories`) by name, e.g. `{ OK: "var(--tz-chart-2)", Failure:
   * "var(--tz-chart-4)" }`; a category without one takes the palette's next color, in the order the categories first
   * appear.
   */
  readonly categoryColors?: Readonly<Record<string, string>>;
  /** A donut's hole, as a share of its radius (0.6). */
  readonly donutHole?: number;
}

# @tsazor/charts

Charts for [Tsazor](../../README.md): line, area, bar, stacked bar, donut and pie charts and sparklines, drawn as SVG in
the colors of the skin on the page — Fluent's or Bootstrap's — with no chart library and no canvas. MudBlazor's
`MudChart` is the model ([design-charts.md](../../docs/design-charts.md)).

```bash
pnpm add @tsazor/charts
```

```ts
import "@tsazor/charts/charts.css";
```

```razor
@import { Chart, Sparkline, type ChartSeries } from "@tsazor/charts"

<Chart ChartType="line" ChartSeries="@sold" ChartLabels="@days" AriaLabel="Loaves sold this week" />
<Sparkline Data="@trend" AriaLabel="Rye" />

@code {
    private readonly days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    private readonly sold: ChartSeries[] = [{ name: "Rye", data: [120, 98, 134, 110, 156, 182] }];
    private readonly trend = [104, 121, 99, 140, 133, 171];
}
```

- **Types:** `line`, `area`, `bar`, `stacked-bar`, `donut`, `pie`. A pie or a donut draws the first series, a slice
  per label.
- **Options** (`ChartOptions`): `yAxisTicks` (the step), `maxNumYAxisTicks`, `yAxisMin`, `yAxisSuggestedMax`,
  `yAxisFormat` (a function: ``(value) => `${value} €` ``), `yAxisLines`, `xAxisLines`, `yAxisTitle`, `xAxisTitle`,
  `interpolation` (straight, smooth — a monotone curve that never shows a value the data doesn't have),
  `lineStrokeWidth`, `showLegend`, `chartPalette`, `donutHole`.
- **Colors:** `--tz-chart-1` … `--tz-chart-8` take the skin's tokens; set them in the app's CSS, or give
  `chartPalette`.
- **Accessible:** a figure named `AriaLabel` and described in words ("Line chart: Rye from 98 to 182, over Mon to
  Sat"); the numbers follow in a table (`ShowTable`, default on). With `@bind-SelectedIndex` each series or slice is a
  button the keyboard chooses; `CanHideSeries` turns the legend into checkboxes. A point's value shows on hover.
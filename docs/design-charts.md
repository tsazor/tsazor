# Design: `@tsazor/charts`

Decision D-L2 ([design-library-completeness.md](design-library-completeness.md)): charts in wave B, as SVG in the
skins' tokens, with the breadth MudBlazor ships. Until now an app drew charts through `@attach` (Chart.js) or in
markup of its own ([guide-charts.md](guide-charts.md)); both stay right for what this package doesn't cover.

## 1. What

- **One `Chart` component** for MudBlazor's `MudChart` (its newer API): `chartType` line, area, bar, stacked-bar,
  donut or pie; `chartSeries` (`{ name, data: number[] }[]`); `chartLabels` (the x axis's labels, or the slices'
  names); `chartOptions`; `width`, `height`; `legendPosition`; `@bind-selectedIndex` (a clicked series or slice);
  `canHideSeries` (the legend's buttons hide a series).
- **`Sparkline`**: a line without axes for a table cell or a card, with its text alternative.
- **Not now:** MudBlazor's time series, heat map, radar, rose, Sankey and scatter plot (Chart.js through `@attach`
  covers them, guide-charts.md), and its tooltip templates.

## 2. How

- **SVG in markup.** The renderer owns the DOM; the math (a scale with round ticks, a line or a smooth curve, the
  arcs of a donut) is pure TypeScript in `src/chart-math.ts`, tested once. No chart library, no canvas.
- **The skins' colors.** A palette of CSS custom properties (`--tz-chart-1` … `--tz-chart-8`) defaults to the
  skin's tokens — Fluent's first, else Bootstrap's (`var(--fui-brand-background, var(--bs-primary))`) — so one
  package draws in either skin; `chartOptions.chartPalette` replaces them.
- **Accessible as a figure.** The SVG is an image (`role="img"`) named by `ariaLabel` and described by a summary the
  component writes ("Line chart: Rye from 98 to 182, Spelt from 40 to 75, over Mon to Sat"); a table of the numbers
  follows in a `<details>` (`showTable`). The legend's buttons, and the slices of a pie or a donut, take the
  keyboard; a point's value shows on hover and on focus (`<title>` for the pointer).
- **Reduced motion.** It doesn't animate.
- **Values as functions.** A .NET format string (`YAxisFormat="C0"`) becomes a function
  (`yAxisFormat: (value) => …`), as with the Slider's `valueFormat`.

## 3. Decisions

| # | Question | Decision |
|---|---|---|
| C1 | A package or the skins? | A package, `@tsazor/charts`, skin-independent like `@tsazor/markdown`: the colors come from whichever skin's tokens are on the page |
| C2 | Which MudBlazor API? | The newer one (`ChartLabels`, `ChartSeries` with `Data`, options per chart); the older `XAxisLabels`, `InputData`, `InputLabels` map onto it (migration-practices.md) |
| C3 | Interactivity | Selection and hiding series as MudBlazor's; points named for the pointer, the numbers in the table for everyone |

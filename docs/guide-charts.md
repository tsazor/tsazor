# Charts and visualizations

Tsazor has no chart component yet (`@tsazor/charts` comes in wave B,
[design-library-completeness.md](design-library-completeness.md), D-L2). Until then, and for anything a chart
component doesn't cover, an app uses one of two patterns. Both run in `apps/skins` (`/charts`), and its gate checks
them in Edge, Firefox and WebKit, with both skins.

1. **A chart library on a canvas or an element of its own, through `@attach`.** Chart.js, ECharts, uPlot and
   ApexCharts all work this way: they take an element and draw into it.
2. **The app's own SVG in markup**, with a layout library for the math. d3's layout modules (`d3-hierarchy`,
   `d3-scale`, `d3-shape`) compute positions; the markup draws the shapes, so the renderer keeps the DOM.

If you come from Blazor: there you call a chart library through JS interop (`IJSRuntime.InvokeAsync` with an
`ElementReference`) and dispose it in `DisposeAsync`. In Tsazor the library is plain TypeScript in the same bundle,
and `@attach` gives the element and the cleanup in one function.

## A chart library through `@attach`

An attachment is a function that gets the element once it is in the page and returns a cleanup for when it
leaves. That is exactly a chart's lifetime: create, then destroy.

```razor
<canvas role="img" aria-label="@summary" @attach="sales.attach"></canvas>

@code {
    private readonly sales = new SeriesChart(this.thisWeek);

    private show(week: Series): void {
        this.sales.update(week);
    }
}
```

The controller keeps the chart, so new data updates it in place (and it animates) instead of starting over
(`apps/skins/src/charts.ts`, shortened to bars; it draws lines too):

```ts
export class SeriesChart {
  #chart?: Chart<"bar">;
  constructor(private series: Series) {}

  readonly attach: Attachment<HTMLCanvasElement> = (canvas) => {
    let attached = true;
    // Chart.js loads with the first chart: pages without one don't carry it.
    void import("chart.js").then(({ Chart, BarController, BarElement, CategoryScale, LinearScale }) => {
      if (!attached) return; // the canvas left before Chart.js arrived
      Chart.register(BarController, BarElement, CategoryScale, LinearScale);
      this.#chart = new Chart(canvas, { type: "bar", data: this.data(canvas), options: this.options(canvas) });
    });
    return () => {
      attached = false;
      this.#chart?.destroy();
      this.#chart = undefined;
    };
  };

  update(series: Series): void {
    this.series = series;
    if (this.#chart === undefined) return;
    this.#chart.data.datasets[0]!.data = [...series.values];
    this.#chart.update();
  }
}
```

- **Two ways to update.** Keep the chart and change its data (above), or pass a new attachment: Tsazor runs the old
  cleanup and attaches the new one, which starts the chart over. A new attachment per render would restart it on
  every render, so create the attachment once (a field), as here.
- **Load it lazily.** `import("chart.js")` inside the attachment puts Chart.js into a chunk of its own. Register only
  the parts you use (`Chart.register(BarController, …)`) instead of `chart.js/auto`, and the chunk stays small.
- **A late load.** The attachment is synchronous and the import isn't; the `attached` flag keeps a chart from being
  created on a canvas that already left (a quick navigation).
- **Colors from the skin.** Read CSS custom properties from the element (`getComputedStyle(canvas)`), and define
  them in the app's CSS from the skin's tokens: `--chart-color: var(--fui-brand-background, var(--bs-primary))` takes
  Fluent's brand color, else Bootstrap's primary. Listen to `matchMedia("(prefers-color-scheme: dark)")` and update
  the chart's colors when the scheme changes.
- **Motion.** With `prefers-reduced-motion: reduce`, set `animation: false`. A live chart doesn't animate either
  (`chart.update("none")`): each new value would otherwise slide the whole line along
  ([guide-live-data.md](guide-live-data.md#into-a-chart)).
- **Accessibility.** A canvas is an image to a screen reader. Give it `role="img"` and an `aria-label` that says
  what the chart shows ("Loaves sold this week: from 98 to 182, the most on Sat."), and put the numbers in a table
  next to it (`<details><summary>The data</summary><table>…</table></details>`), from the same data.
- **Size.** Chart.js sizes the canvas to its parent: give the parent a height and `position: relative`, and set
  `maintainAspectRatio: false`.
- **CSP.** Try a library under your Content Security Policy: one that injects `<style>` elements or evaluates code
  needs the matching `style-src` or `script-src` ([csp.md](csp.md)).

Plain JavaScript would do the same with a `mounted`/`unmounted` pair (Vue) or a Svelte action (`use:chart`, which
`@attach` resembles). An ECharts or uPlot integration differs only in the calls: `echarts.init(element)` and
`chart.dispose()`, `new uPlot(options, data, element)` and `plot.destroy()`.

## The app's own SVG in markup

When the visualization is the app's own — a treemap of sales, a coverage chart, a timeline of events — no chart
library fits better than markup. A layout library computes the positions, and `@foreach` draws the shapes. The
renderer keeps the DOM, events work as anywhere (`@onclick` on a `<rect>`), and the SVG scales with `viewBox`.

```razor
@import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy"

<svg class="treemap" viewBox="0 0 600 260" role="img" aria-labelledby="treemap-title">
    <title id="treemap-title">@treemapTitle</title>
    @foreach (const tile of tiles) {
        <g class="@(`treemap__tile treemap__tile--${tile.group}`)">
            <rect x="@tile.x" y="@tile.y" width="@tile.width" height="@tile.height" rx="3"><title>@tile.name: @tile.value</title></rect>
            @if (tile.width > 70 && tile.height > 28) {
                <text x="@(tile.x + 6)" y="@(tile.y + 18)" aria-hidden="true">@tile.name</text>
            }
        </g>
    }
</svg>

@code {
    private get tiles() {
        const root = hierarchy<Product>({ name: "Sales", children: this.products })
            .sum((node) => node.value ?? 0)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
        return treemap<Product>().size([600, 260]).padding(2).tile(treemapSquarify)(root)
            .leaves()
            .map((leaf) => ({ name: leaf.data.name, value: leaf.value ?? 0, x: leaf.x0, y: leaf.y0, width: leaf.x1 - leaf.x0, height: leaf.y1 - leaf.y0 }));
    }
}
```

- **Only the math from d3.** `d3-hierarchy`, `d3-scale` and `d3-shape` compute; they don't touch the DOM. Don't use
  `d3-selection` on markup the renderer owns: the next render would undo its changes, or it would undo the
  renderer's.
- **Compute once.** A getter recomputes on every render, which is cheap for a few dozen shapes. For thousands,
  compute in `onParametersSet` when the data changes and keep the result in a field.
- **Colors from the skin**, as above, in CSS: `.treemap__tile--breads rect { fill: var(--fui-brand-background,
  var(--bs-primary)); }`. Check the text's contrast in both skins: Fluent's amber takes white text, Bootstrap's
  yellow black.
- **Accessibility.** `role="img"` with a `<title>` that sums the picture up, a `<title>` per shape for the pointer,
  and the numbers in a table when they matter.

## In a Blazor port

- **MudBlazor's `MudChart`** (line, bar, pie, donut): Chart.js through `@attach` until `@tsazor/charts`.
- **A chart through JS interop** (Blazor-ApexCharts, ChartJs.Blazor, a module of your own): the library's JavaScript
  calls move into an attachment, the C# wrapper goes away. `DotNetObjectReference` callbacks (a click on a bar)
  become plain functions in the chart's options.
- **An SVG component of your own** keeps its markup; the C# layout code becomes TypeScript, or a d3 layout module.

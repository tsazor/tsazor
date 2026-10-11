# Migration practices (working notes)

Status: **collecting** (owner, 2026-10-09). The raw material for the migration guide that comes next. Each entry
says what you find in the Blazor app, what to do in Tsazor and why, and names the finding it comes from. The
findings are in [port-fluentcms.md](port-fluentcms.md) (F, U), [port-findings.md](port-findings.md) and the design
docs. The setup reference stays [migration.md](migration.md): running side by side, the codemod, the API boundary.

Add an entry whenever a port, a parity suite or the owner's use teaches something a migrating team would want to
know first.

## How to port

1. **Page by page, next to the original.** Keep the Blazor app running behind the gateway
   ([migration.md](migration.md)), so you can compare at any time.
2. **Keep a findings table from the first day.** Give each item an ID, an area, what happened and the fix. Keep
   three kinds apart:
   - framework gaps: fixed in Tsazor, with a test;
   - adaptations of the app;
   - bugs in the original (U1–U4): don't copy them, and don't "fix" them as if they were yours.
3. **Compare against the original, not against your memory of it.**
   - Render the same data in both and compare the HTML. The public site was compared character for character.
   - Drive the original's UI. U4 (a contact form that stored every message empty) only showed that way.
4. **Measure what the browser paints, with latency.** A flash that came only sometimes on localhost came every
   time at 40 ms latency, in a CDP screencast (F39). Checks that compare content miss elements that are removed
   and added again (F38).
5. **Test in Edge, Firefox and WebKit.** Blazor's own suites run in Chrome only. WebKit found two bugs that Blazor
   11 has too (Virtualize A11, A12; [design-virtualize.md](design-virtualize.md) §6), and Safari users meet them.
   Firefox and WebKit found a third that Edge's timing hid (A16: a live feed pulled the reader back to the bottom).
6. **Port the original's tests where they exist.** Blazor's Virtualize suite became Tsazor's parity gate
   (`apps/blazor-parity`). A test that fails only sometimes can be a real race: run it in a loop before you call
   it flaky (A12, A15).
   - Port the skipped and quarantined tests too, and run them. Two of Blazor's marked real bugs (#66509,
     #68777), fixed in Tsazor (A6, A13).
7. **Check a "C# does the same" against the Razor compiler.** A scratch `dotnet new razorclasslib` with
   `Nullable` on answers in a minute. A note from the tutorial port said C#'s nullable analysis drops a narrowing
   in child content too; it doesn't, and three ports and a dogfood paid for the workaround before F15 was fixed.
8. **Debug a race with a log, not a debugger.** Stopping the code changes the timing, and the race goes away. Push
   the events (observer reports, decisions, scroll positions) into an array on `globalThis` and print it in the
   test's failure message. One failing run then shows the cause: that found A13, A14 and A15.

## From static SSR to an SPA

Blazor Web Apps often render statically on the server with interactive islands (FluentCMS does). Tsazor apps
render in the browser.

- **Page data.** A static SSR page arrives with its data. In an SPA the page shows first and fills in, and a
  shorter page can move the footer for a few frames (F39).
  - Tsazor holds the previous page during a navigation until the new one has its data (E13,
    `routing.holdPreviousPage`).
  - Data a service loads belongs in the Router's `OnNavigateAsync`, so the hold waits for it. Data loaded on
    `LocationChanged` isn't waited for.
- **`@rendermode` goes away** (TZS014). Everything is interactive.
- **Static SSR forms** (`[SupplyParameterFromForm]`, `FormName`, `Enhance`) become interactive `EditForm`s. The
  original's static contact form bound nothing for visitors (U4).
- **Enhanced-navigation hooks.** Scripts that listen for the original's "after enhanced navigation" event bind
  again on every event (U3). The port raises the same events, so fix such a script once instead of copying it.
- **Render fragments compare by identity.** A C# lambda that uses only `this` is an equal delegate on every render;
  a JS function is a new one each time.
  - The compiler caches child content without outer locals (render hint H4).
  - Hand-written builder code passes one function per instance, as `PageTitle` and `HeadOutlet` do (F38).

## The backend boundary

- **Secrets move behind a BFF.** A Blazor Server UI holds the API token and the user's JWT on the server. An SPA
  needs a BFF for them. Behind the BFF's proxy the backend must still see the browser's host (F4).
- **Generate the clients** with `tsazor-dotnet generate`. Swashbuckle's output needs care: a missing
  `operationId`, missing `required`, multipart bodies and envelopes (F1–F3, F5, F7, F8; all handled now).
- **Calls that throw.** Code ported from NSwag clients expects a throwing call (`catch (ApiClientException)`). Use
  a small `ensureOk(result)` helper (F13).
- **Bearer tokens and envelopes are in `@tsazor/dotnet`.** `JwtAuthenticationStateProvider` with
  `attachJwtAuth(http, provider)` replaces the `DelegatingHandler` that adds the token, and `tsazor-dotnet generate
  --envelope data,errors` unwraps an `ApiResult<T>`-style envelope. A hand-written client types every call itself —
  `getJson<T>` is a cast, not a check — so declare the envelope once. Where Blazor needs a handler of its own for
  an expired token, `attachJwtAuth` logs out on the 401, and `AuthorizeRouteView` redirects to the login (V2, V3 in
  port-findings.md). A response interceptor gets the request too, as a `DelegatingHandler` does.
- **Dates.** `DateTime.ToString()` writes the server's culture (`06.06.2024` on a German machine), and the browser
  can't know it. Run the backend with invariant globalization, or send ISO 8601 (U2). .NET format strings work in
  `@bind:format` (F34).
- **Signing in or out.** `CookieAuthenticationStateProvider` can't be asked again yet. Reload after sign-in, as the
  original redirects (F10, open).

## C# in `@code` becomes TypeScript

- **Lifecycle names.** `OnInitializedAsync` is `onInitialized` returning a Promise. A C#-style
  `onInitializedAsync` gets TZS032 with a rename fix (F14).
- **Method names are Blazor's, in camelCase — `Async` included.** `RefreshDataAsync()` is `refreshDataAsync()`,
  `ScrollToItemAsync` `scrollToItemAsync`, a `FluentOverlay`'s `ShowAsync()` `showAsync()`, a `FluentWizard`'s
  `GoToStepAsync` `goToStepAsync`, and an `AuthenticationStateProvider` overrides
  `getAuthenticationStateAsync()`. A method without `Async` in Blazor has none here either, even when it returns a
  Promise (MudBlazor's `MoveTo` is a Carousel's `moveTo`). A method Tsazor adds gets `Async` when it returns a
  Promise. Tsazor chooses this over JavaScript's habit (`fetch()`, `json()` carry no suffix) because a Blazor
  developer then finds every method under the name they know, and the codemod renames by rule, not by table. Two
  exceptions: a lifecycle pair is one method (above), and the HTTP client follows `fetch` — `GetFromJsonAsync<T>` is
  `getJson<T>`.
- **Narrowing works as in Razor, except in your own lambdas.** `@if (model != null) { <Card>@model.name</Card> }`
  and `<InputText @bind-Value="model.name" />` inside it check clean: child content, slots, templates and bind
  setters are read where they stand, as C# reads them (F15). A lambda you write is TypeScript's:
  `@onclick="() => save(model.id)"` inside the same `@if` is TS2532, because the handler runs on the click. Take
  a local first (`const current = model;`), or pass the value in (`@onclick="() => save(id)"` from a loop
  variable). This is the place a Blazor team meets most often.
- **Types in `@code` need an `@import`.** Tags resolve through `@using`, but code is TypeScript (F29).
- **Cascading by type is `instanceof`.** TypeScript has no runtime types, and generated clients return plain JSON,
  never class instances. Cascade such values by name (F30).
- **Value equality.** C# records and `IEquatable` compare by value; TypeScript compares objects by reference.
  Where Blazor relies on equality, give a key: `ItemKey` for rows, `ItemComparer: (a, b) => a.id === b.id` for a
  virtualized provider list. With fresh objects from the provider and no comparer, every load that changes the
  count looks like a prepend, and rows deleted above the viewport go unnoticed (A6).
- **Cancellation and tasks.** `CancellationToken` is `AbortSignal` (`request.signal`), and `Task` is `Promise`.
  Tsazor keeps Blazor's semantics: a superseded `scrollToItemAsync` resolves, and only the caller's own abort rejects.
- **Enums** stay enums, and `[Flags]` combinations with `|` work (`VirtualizeAnchorMode.Start | End`).
- **Generic components infer like Razor.** `TGridItem` comes from `Items` or from `ItemsProvider` (a
  `GridItemsProvider<Person>` field), and cascades to the columns. Where nothing can be inferred, the errors in the
  columns carry Razor's RZ10001 as their hint: set the type argument on the grid (`TGridItem="Person"`).
- **Attribute values.** A `"` inside a bare lambda attribute ends the value: write `@(...)` (F23).
- **What just works:**
  - a static through the component's own class name (F19);
  - `@ref="this.x"` (F26);
  - forwarding an unset `EventCallback` (F27);
  - `string | null` bound to a text input (F18).

## Components and libraries

- **Map the component library** (Fluent UI Blazor, MudBlazor) to `@tsazor/fluent` or `@tsazor/bootstrap`. A
  missing component is a finding: the completeness plan ([design-library-completeness.md](design-library-completeness.md))
  closes the gaps before 1.0. Icons are the first wall (F17). Both skins have the same components and parameters
  (only Fluent's Indicator and Spacer are missing in Bootstrap), so the skin is a choice of looks, not of features.
- **Icons.** `@import * as Icons from "@tsazor/fluent-icons"` (or `@tsazor/bootstrap-icons`), then
  `new Icons.Regular.Size20.Save()` becomes `Icons.Regular.Size20.Save`: a shared value, not an instance per use.
  `<FluentIcon Value="…" Width="24px" />` becomes `<Icon Value="…" size="24" />`, and without a size the icon is
  drawn at its own, as in Fluent UI Blazor. `IconStart`/`IconEnd` on buttons, menu items, badges and links, Tab's
  `IconStart` and the tree item's icons keep their names; a nav item's `IconRest`/`IconActive` become a SidebarNav
  link's `icon`/`iconActive`. An app's own icon is `icon("name", svg)`, exported by both skins (Fluent UI Blazor's
  `new Icon(name, variant, size, content)`). The codemod does the `new Icons…()` part. Only the icons a page uses
  reach its bundle; in the dev server the namespace loads the whole set (about 1 s), and
  `@tsazor/fluent-icons/regular/size20` loads one module.
- **An app's own icon set** (FluentCMS keeps its SVGs in a `.resx` and names them by an `IconName` enum): generate
  one module of `icon()` values from the resource, `export const IconName = { Delete: icon("delete", "<svg…>"), … }`,
  and import it once in `_Imports.tsazor`. The markup keeps `IconName.Delete`; a parameter of type `IconName` becomes
  one of type `IconValue`. Generate it with a script (the FluentCMS port's `scripts/icons.mjs`), so an update of the
  original's set is one run.
- **Markdown.** `<MudMarkdown Value="@text" />` becomes `<Markdown Value="@text" />` from `@tsazor/markdown`. It
  always sanitizes, so text from an agent or a user needs no extra step. A Markdig pipeline's options become
  `Breaks`, `Highlight` (a highlighter) and `TableClass`. A test of what it renders needs jsdom: DOMPurify doesn't
  sanitize under happy-dom (L5).
- **Wizards.** `<FluentWizard @bind-Value="step"><Steps><FluentWizardStep Label="…">` becomes
  `<Wizard @bind-Value="step"><Steps><WizardStep Label="…">`; a step's `OnChange` sets `args.isCancelled`, and a
  `FluentForm` in a step is validated before Next, as an `EditForm` is in Fluent UI Blazor. `StepperPosition.Left`
  becomes `"start"`. MudBlazor's `MudStepper` maps onto it too: `ActiveIndex` is `Value`, a step's `Title` its
  `Label`, `NonLinear` is `StepSequence="any"`.
- **Splitters.** `FluentMultiSplitter`/`FluentMultiSplitterPane` keep their names (`MultiSplitter`, `MultiSplitterPane`)
  and parameters (`Size`, `Min`, `Max`, `Collapsible`, `Resizable`, `OnResize`). MudBlazor's two-pane `MudSplitPanel`
  (`FirstPanel`, `SecondPanel`) becomes a `Splitter` with two `SplitterPane`s; `MinPanelSize` is each pane's `Min`.
- **Toolbars.** `<MudToolBar Dense="true" WrapContent="true">` becomes `<Toolbar Size="small" Wrap="true" AriaLabel="…">`;
  a `MudDivider Vertical="true"` between groups becomes `<Divider Orientation="vertical" />`. A `MudSpacer` that
  pushes the rest to the end becomes `style="margin-inline-start: auto"` on the control after it (`Spacer` is a fixed
  gap). Fluent UI Blazor v4's `FluentToolbar Orientation` keeps its name. Give it a name: it is one tab stop, and the
  arrow keys move between its Buttons, Menus and fields, as the WAI-ARIA toolbar pattern says; MudToolBar leaves each
  control its own tab stop.
- **Time pickers.** `FluentTimePicker` keeps its parameters as `<TimePicker>` (`StartHour`, `EndHour`, `Increment`,
  `DisabledTimeFunc`); `Culture` becomes `Locale`, `RenderStyle="DatePickerRenderStyle.Native"` is
  `RenderStyle="native"`. The value changes type as the date picker's does: a `TimeOnly?` or a `DateTime?` becomes
  ISO text, `"14:30:00"` — what System.Text.Json writes for a `TimeOnly` and reads back — and an empty field `""`;
  compare times as text. A `DateTime` that holds a date and a time takes a DatePicker and a TimePicker side by side,
  joined as `${date}T${time}`. MudBlazor's `MudTimePicker` (a clock dial) becomes the same list: `AmPm="true"` is
  `HourCycle="h12"`, `MinuteSelectionStep` is `Increment`.
- **Ratings.** MudBlazor's `<MudRating @bind-SelectedValue="stars" MaxValue="10" />` becomes
  `<Rating @bind-Value="stars" Max="10" />` (an input, so it validates in a form); `FullIcon`/`EmptyIcon`, `Size`,
  `ReadOnly`, `Disabled` and `HoveredValueChanged` keep their names; a `Color` takes neutral, brand or marigold.
  Fluent UI Blazor's `FluentRatingDisplay` keeps its parameters as `<RatingDisplay>` (`Value`, `Max`, `Count`,
  `Compact`, `Shape`). Its stars are radio buttons, so a screen reader hears "3 stars, 3 of 5", and the arrows stop at
  the ends instead of wrapping around.
- **Highlighting.** `FluentHighlighter` and `MudHighlighter` keep their parameters as `<Highlighter>` (`Text`,
  `HighlightedText`, `Delimiters`, `HighlightedTexts`, `CaseSensitive`, `UntilNextBoundary`). MudBlazor's
  `Markup="true"` has no counterpart: the text stays text, so markup in a search result can't run.
- **Focusing an input.** `await nameInput.Element.Value.FocusAsync()` (Blazor) and `await field.FocusAsync()` (Fluent
  UI Blazor) become `this.nameInput?.element?.focus()`: every input holds its field as `element` once rendered.
- **Keyboard shortcuts.** MudBlazor's `<MudHotkey Key="JsKey.KeyK" KeyModifiers="@(new[] { JsKeyModifier.ControlLeft })"
  OnHotkeyPressed="…">` becomes `<Hotkey Keys="Ctrl+K" OnHotkeyPressed="…">`: the combination is text, and "Mod+K"
  is Cmd on a Mac and Ctrl elsewhere. A plain key ("?") doesn't fire while someone types into a field. Fluent UI
  Blazor's `FluentKeyCode` keeps its parameters as `<KeyCode>` with key names as the browser writes them
  (`KeyCode.Enter` is `"Enter"`, `KeyCode.Down` is `"ArrowDown"`); its handlers get the KeyboardEvent. On one element
  of your own, `@onkeydown` with `@onkeydown:preventDefault` needs neither. Put `aria-keyshortcuts` on the control a
  shortcut triggers (`ariaKeyShortcuts` writes it).
- **Color pickers.** `FluentColorPicker` keeps `SelectedColor`, `Palette`, `FindClosestColor`, `Width` and `Height`;
  `View="ColorPickerView.SwatchPalette"` is `View="swatch"`, `ColorWheel` `"wheel"`, `HsvSquare` `"hsv"`.
  `FluentColorPickerInput` becomes `<ColorPickerInput @bind-Value="…">` (`HideTextInput`, `IconPalette`). MudBlazor's
  `MudColorPicker` (a `MudColor` value) takes hex text instead: `color.Value` is `"#rrggbb"`; its alpha channel has no
  counterpart. The value is hex text, as an `<input type="color">` and CSS take it.
- **Carousels.** MudBlazor's `MudCarousel` with `MudCarouselItem`s keeps its parameters as `<Carousel>`/`<CarouselItem>`
  (`SelectedIndex`, `AutoCycle`, `ShowArrows`, `ShowBullets`, `EnableSwipeGesture`, `ItemsSource`, `ItemTemplate`);
  `AutoCycleTime="TimeSpan.FromSeconds(5)"` is milliseconds, `AutoCycleTime="5000"`. A turning carousel gets a stop
  button and stops while hovered or focused (WCAG 2.2.2); the slides are named "2 of 5". Arrow, bullet and button
  templates have no counterpart: style the buttons, or turn `ShowArrows` off and call `next()`/`previous()` on a
  `@ref`. With Bootstrap, add `class="carousel-dark"` for dark controls on light slides.
- **Links and images.** `FluentLink` and `MudLink` become `<Link>` (`Href`, `Target`, `Appearance`, `IconStart`,
  `IconEnd`; `ForceLoad` is rel="external", which the app's navigation leaves to the browser). A `MudLink` with only
  an `OnClick` renders a button. `FluentImage` keeps `Source` and `AlternateText`; MudBlazor's `MudImage` `Src` and `Alt`
  become those, `ObjectFit` is `Fit`, `Elevation` is `Shadow`. `MudScrollToTop` keeps `TopOffset` and `Selector`;
  its own button replaces a child `MudFab`.
- **Input masks.** `<MudTextField Mask="@(new PatternMask("(000) 000-0000"))">` keeps its shape as `<TextInput
  Mask="@(new PatternMask("(000) 000-0000"))">` (PatternMask from `@tsazor/ui`), or shorter `Mask="(000) 000-0000"`;
  `CleanDelimiters` and `Placeholder` are options (`{ cleanDelimiters: true }`), `Transformation` is `transform`.
  MudBlazor's DateMask, RegexMask, BlockMask and MultiMask have no counterpart yet: a date takes a DatePicker, a
  pattern a `pattern` attribute and the form's validation.
- **Overflowing rows.** `FluentOverflow` with `Items` and `ItemTemplate` keeps its parameters as `<Overflow>`
  (`ItemText`, `MaxRenderedItems`, `Orientation`, `MoreTemplate`, `OverflowTemplate`, `OnMoreClick`). The "+N" is a
  button that opens the overflowed items, where they stay usable, instead of a tooltip that lists their names.
  Overflowing child content (without `Items`) has no counterpart: give the items as a list.
- **Busy states.** `<FluentOverlay @bind-Visible="saving" FullScreen="true">` keeps its parameters as `<Overlay>`
  (`Interactive`, `BackgroundColor`, `Opacity`, `CloseMode`; `OverlayCloseMode.InsideOnly` is `"inside"`,
  `OutsideOnly` `"outside"`), and `ShowAsync()`/`CloseAsync()` are `showAsync()`/`closeAsync()`. MudBlazor's
  `MudOverlay`: `Absolute="true"` is the default (it covers its container: give that `position: relative`), without it
  `FullScreen="true"`; `AutoClose="true"` is `CloseMode="all"`, without it `"manual"`; `Modal="false"` is
  `Interactive="true"`; `DarkBackground` is `BackgroundColor`. For a save or a load, take `CloseMode="manual"`: the
  default closes on a click, as Fluent UI Blazor's does. What the overlay covers is inert while it shows, so the
  busy form can't be submitted twice and a screen reader doesn't read it.
- **Sliders.** `<FluentSlider @bind-Value="volume" Min="0" Max="100" Step="5" />` keeps its parameters as
  `<Slider @bind-Value="volume" …>` (`Orientation`, `Size`, `ImmediateDelay`), and so does MudBlazor's `MudSlider`
  (`TickMarks`, `TickMarkLabels`, `ValueLabel`, `Immediate`); its `Vertical` becomes `Orientation="vertical"`. A .NET
  format string (`ValueLabelFormat="F1"`) becomes a function, `ValueFormat="@((v) => v.toFixed(1))"`, and it is the
  text screen readers read as well. MudBlazor's `Variant.Filled` has no parameter: the Fluent slider always fills
  its rail up to the thumb, Bootstrap's `.form-range` never does.
- **Date pickers and calendars.** `FluentDatePicker` and `FluentCalendar` keep their names without the prefix
  (`<DatePicker>`, `<Calendar>`) and their parameters (`View`, `MinDate`, `MaxDate`, `DisabledDateFunc`, `DayFormat`,
  `DaysTemplate`, `SelectMode`, `SelectedDates`, `PickerMonth`). The value changes type: a `DateTime?` or `DateOnly?`
  becomes ISO text, `"2026-10-10"`, and an empty field `""`. Tsazor chooses the string because a JavaScript `Date`
  carries a time and a time zone that can shift the day, while a .NET `DateOnly` arrives in JSON as that very text
  (a `DateTime` model property becomes `string`; compare dates as text, `a < b`). `Culture` becomes `Locale`
  (`"de-DE"`), which also sets the week's first day and how typed dates are read. `CalendarSelectMode.Range` is
  `SelectMode="range"`. MudBlazor's `MudDatePicker` maps onto the same component: `Date` is `Value`,
  `IsDateDisabledFunc` is `DisabledDateFunc`, `OpenTo="OpenTo.Month"` is `View="months"`, `FirstDayOfWeek` stays;
  a `MudDateRangePicker` becomes a `Calendar` with `SelectMode="range"`. Plain JavaScript would hand you a `Date`
  (or `Temporal.PlainDate` where it ships); `parseIsoDate` and `isoDate` in `@tsazor/ui` convert.
- **File uploads.** `FluentInputFile` becomes `FileUpload` (`InputFile` stays Blazor's plain input), with its
  parameters (`Multiple`, `MaximumFileCount`, `MaximumFileSize`, `Accept`, `Mode`, `AnchorId`, `DragDropZoneVisible`,
  `ProgressTemplate`, `OnFileUploaded`, `OnProgressChange`, `OnFileError`, `OnCompleted`). Under Blazor Server
  `Mode.SaveToTemporaryFolder` wrote to the server's disk; in the browser that becomes an `Upload` function:
  `Upload="@sendToApi"` with `private readonly sendToApi = uploadTo("/api/files")` (one uploader, not a new one per
  render) posts each file with its progress, and the API stores it (an ASP.NET minimal API takes it as an
  `IFormFile`). `Mode.Buffer` hands `onFileUploaded` the whole `buffer` (a `Uint8Array`), each chunk
  arriving in `onProgressChange`. MudBlazor's `MudFileUpload` with an activator button becomes a `FileUpload` with
  `AnchorId` and `DragDropZoneVisible="false"`.
- **Sortable lists.** `<FluentSortableList Items="@items" OnUpdate="@SortList">` with an `ItemTemplate` keeps its
  parameters as `<SortableList @bind-Items="items">` (`Group`, `Clone`, `Drop`, `Sort`, `Handle`, `ItemFilter`,
  `OnUpdate`, `OnAdd`, `OnRemove`; `Fallback` is gone, as there is no SortableJS). The usual `OnUpdate` handler that
  moved the item in the list itself is not needed: `@bind-Items` gets the new order. Tsazor adds a keyboard way
  (Space, the arrows, Escape) and announcements, which SortableJS lacks; give each list a visible name
  (`aria-labelledby`). MudBlazor's `MudDropContainer`/`MudDropZone` with zone selectors becomes one `SortableList` per
  zone in one `Group`.
- **Charts.** `MudChart` becomes `@tsazor/charts`' `<Chart>`: `ChartType="ChartType.Line"` is `ChartType="line"`
  (`StackedBar` is `"stacked-bar"`), `ChartSeries` keeps `Name` and `Data`, `ChartLabels` stays — the older
  `XAxisLabels` and `InputLabels` become it, and `InputData` a single series. `ChartOptions` keeps `YAxisTicks`,
  `MaxNumYAxisTicks`, `YAxisLines`, `XAxisLines`, `ChartPalette` and `LineStrokeWidth`; `YAxisFormat="C0"` becomes a
  function, `InterpolationOption.NaturalSpline` is `interpolation: "smooth"`. `SelectedIndex` and `CanHideSeries` stay.
  Time series, heat maps, radar and Sankey charts, and chart wrappers over JS interop, become a chart library through
  `@attach`; an SVG component of the app's own keeps its markup ([guide-charts.md](guide-charts.md)).
- **Live updates.** What a Blazor Server page got through its circuit (a service's C# event,
  `InvokeAsync(StateHasChanged)`) becomes a stream the page observes: server-sent events, a WebSocket or SignalR's
  JavaScript client, through `this.observe` ([guide-live-data.md](guide-live-data.md)). Number the events and answer
  `Last-Event-ID`, and a dropped connection loses nothing. A live chart keeps a window of the last values in the
  page and updates the chart without animation ([guide-live-data.md](guide-live-data.md#into-a-chart)).
- **Inputs that update while typing.** `FluentTextField Immediate="true" ImmediateDelay="300"` becomes
  `<TextInput Immediate="true" ImmediateDelay="300" @bind-Value="…" />` (TextArea too). Without it the value
  updates on change, as Blazor's `InputText` does.
- **Check the skins' parameter names against the reference, not against a guess.** The slot names came from
  Fluent UI Blazor's main branch (a sparse clone of `src/Core/Components` takes a minute): `Tab` has only
  `IconStart`, a nav item has `IconRest`/`IconActive`, Badge has `IconLabel`. A name that matches the reference is
  one thing less to change in a port.
- **Virtualize and QuickGrid** take Blazor 11's parameters.
  - `Items` is an array, and an `ItemsProvider` gets `request.signal`.
  - Rows may differ in height: they are measured.
  - `AnchorMode.End` follows a feed or a chat.
  - `await scrollToItemAsync(i)` resolves once the rows around the target fill the viewport (A15), so code after the
    `await` sees the final rows.
  - The DataGrid passes the same parameters as QuickGrid 11.
- **Await the callbacks you invoke.** Return or await an `EventCallback`'s promise, so an async handler's error
  reaches the `ErrorBoundary` and a test can wait for it (F11, F28).
- **Builder code from data.** `addComponentParameter` (F37). Sequence numbers come from a node's place among its
  siblings (F36).
- **Smaller API shapes:**
  - `Dialog.onClosed` carries no event (F21);
  - breadcrumb items that are state, not URLs, are buttons (F25).

## Tests

- **bUnit becomes `@tsazor/testing`.** `waitUntilIdle` names the work it still waits for (F35). A Virtualize
  renders its rows up to `MaxItemCount`, as with bUnit.
- **A test DOM has no layout.** Put what depends on layout (virtualization, anchoring, scrolling, painted frames)
  in browser tests (Playwright). Run them in all three engines. Under Bootstrap, scroll with `behavior: "instant"`
  before measuring: its reboot scrolls smoothly (L10).

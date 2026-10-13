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
9. **Run the original with its own SDK.** A Blazor 6 app may not build with a current SDK at all: the newer Razor
   compiler names component parameters with `nameof(...)`, so a component library's
   `[Obsolete(error: true)]` parameters become compile errors (BlazorHero on MudBlazor 6.0.2, B1 in
   [port-blazorhero.md](port-blazorhero.md)). Microsoft's `dotnet-install` script puts the old SDK into a folder of
   the project, without admin rights; the original then runs as it did.

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
- **`@attribute [Authorize]` in `_Imports.razor` stays where it is** as `@authorize`, and the sign-in pages'
  `[AllowAnonymous]` becomes `@allowAnonymous` (the TZS021 fix writes both). A page's own
  `[Authorize(Policy = …)]` adds to the inherited one, as in Blazor (B12).
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
- **Signing in needs no reload.** Blazor Server code calls `NavigateTo(url, forceLoad: true)` after a sign-in or
  sign-out, because a circuit keeps the user it started with. With the cookie provider, call `refresh()` and
  navigate normally: it asks the BFF again (F10). An OIDC redirect stays a full navigation.
- **Generate the clients** with `tsazor-dotnet generate`. Swashbuckle's output needs care: a missing
  `operationId`, missing `required`, multipart bodies and envelopes (F1–F3, F5, F7, F8; all handled now).
- **A Swagger document without response types** (controllers that return `IActionResult`, DTOs shared with the
  WebAssembly client through a common project, as hosted Blazor apps do): the generator types the requests but
  answers `HttpResult<void>` for every response. Port the client's managers instead, as hand-written TypeScript
  services with the DTOs ported once — the original's `Client.Infrastructure` is that layer already, and its
  callers keep their shape (BlazorHero's `ProductManager`, B3). Annotating the controllers
  (`[ProducesResponseType(typeof(Result<ProductResponse>), 200)]`) makes the generator usable later.
- **Calls that throw.** Code ported from NSwag clients expects a throwing call (`catch (ApiClientException)`). Use
  a small `ensureOk(result)` helper (F13).
- **Bearer tokens and envelopes are in `@tsazor/dotnet`.** `JwtAuthenticationStateProvider` with
  `attachJwtAuth(http, provider)` replaces the `DelegatingHandler` that adds the token, and `tsazor-dotnet generate
  --envelope data,errors` unwraps an `ApiResult<T>`-style envelope — `--envelope data,messages,succeeded` one with a
  success flag, whose messages on a success ("Product Saved") are no failure (B2). A hand-written client types every call itself —
  `getJson<T>` is a cast, not a check — so declare the envelope once. Where Blazor needs a handler of its own for
  an expired token, `attachJwtAuth` logs out on the 401, and `AuthorizeRouteView` redirects to the login (V2, V3 in
  port-findings.md). Interceptors are a handler chain: a response interceptor gets the request too, and the one
  added last sees the response first — attach `attachJwtAuth` after the client's own error handling, as you'd add
  the handlers (V5). Roles that only a profile endpoint knows come from an override of `createUserAsync`, as from
  an `AccountClaimsPrincipalFactory` (V6).
- **`notifyAuthenticationStateChanged` takes a promise too**, as Blazor's takes a `Task`:
  `this.notifyAuthenticationStateChanged(this.getAuthenticationStateAsync())` works as you'd write it, and
  `AuthorizeView` shows `Authorizing` until it resolves. A state that's ready can go in as it is.
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
- **Dialogs opened from code stay dialogs opened from code.** MudBlazor's `DialogService.Show<T>(title, parameters,
  options)` becomes `dialogs.show(T, { title, parameters, size })` (`@inject DialogService dialogs`, from
  `@tsazor/ui`), and `await dialog.Result` becomes `await dialog.result` (`{ canceled, data }`). In the dialog,
  `[CascadingParameter] MudDialogInstance` becomes `@CascadingParameter({ type: DialogReference }) dialog`, with
  `close(data)` and `cancel()`; `<MudDialog>` becomes the skin's `<Dialog>` without `isOpen` (its `TitleContent`
  is `show`'s title, `DialogActions` its `footer`). Put `<DialogProvider />` into the layout, as `MudDialogProvider`
  (`npm create tsazor --ui` does). A dialog inside it that the code opens and closes keeps its `isOpen` (B6).
- **The app frame** — `MudLayout`, `MudAppBar`, a persistent `MudDrawer`, `MudMainContent` — is one `AppLayout`
  with `header`, `nav` and `@bind-navOpen` (B8); a signed-out page's bar alone is an `AppLayout` without `nav`. The
  bar's buttons take its colour as MudBlazor's `Color.Inherit` did: write them `appearance="transparent"` (B16). A
  `MudSpacer` in the bar becomes a wrapper with `margin-inline-start: auto` around what follows it (see Toolbars).
  `MudNavMenu` with `MudListSubheader`s is a `SidebarNav` with `sections` (B13); a `MudNavLink Target="_blank"` is a
  link with `target: "_blank"` — without it the router takes a backend page such as `/swagger` for an app page
  (B15). `MudTextField`'s adornments are `TextInput`'s `contentBefore` and `contentAfter` (B9); `MudMenu`'s
  `ActivatorContent` is `Menu`'s `labelContent` (B10); a snackbar's `Action` is a toast's `action` (B11).
- **Localizers in components.** Several `IStringLocalizer<T>`s in one component (a page's and its validator's) are
  fine: the component re-renders once on a language change, however many it injects (B18).
- **The library's own texts** (MudBlazor's `MudLocalizer`, Fluent UI Blazor's `IFluentLocalizer`, B29): add the
  `tsazor.ui.*` keys to your string tables — `"tsazor.ui.close": "Schließen"`, `"tsazor.ui.paginator.page": "Seite
  {page} von {pages}"` — and every component shows them in that language; the catalog with the English texts is
  `libraryTextDefaults` in `@tsazor/ui`. A per-instance text such as MudTablePager's `RowsPerPageString` stays a
  parameter (`pageSizeLabel`). Counted texts take an entry per plural category (`….one`, `….other`, and `….few`,
  `….many` where your language has them).
- **MudForm becomes `FluentForm`, and that is a `<form>`.** MudForm is a `div`, so the browser never checked its
  fields. `FluentForm` (as Blazor's `EditForm`) is a real form: a `type="email"` field gets the browser's own check
  first, which stops the submit with the browser's bubble before your validators speak. Write `novalidate` on the
  form to keep their messages (B21). A submit `Disabled="@(!Validated)"` goes away: the fields show their messages
  after a submit, so a disabled button would leave the user with red borders and no reason (U6).
- **Your own dark-mode switch** (MudBlazor's `IsDarkMode` from a stored preference): bind the `FluentProvider`'s
  `theme` to `"light"` or `"dark"`. Both pin the theme, even under the OS's dark mode; the default, `"system"`,
  follows the OS (Fluent UI Blazor's `DesignThemeModes.System`). MudBlazor's `MudThemeProvider` without `IsDarkMode`
  is light: write `theme="light"` there (B20). A brand ramp in `tokenOverrides` colours the accents too: check its brand-80 as link text on the
  page's near-white, not only as a fill behind white text (B19).
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
- **`IBrowserFile` is the browser's `File`.** `e.File.Name`/`Size`/`ContentType`/`LastModified` are
  `e.file.name`/`size`/`type`/`lastModified` (milliseconds). `OpenReadStream(maxSize)` + a `StreamReader` or a
  `byte[]` buffer becomes `await file.text()` or `new Uint8Array(await file.arrayBuffer())`; the cap guarded
  Blazor's transfer into .NET, so compare `file.size` yourself where the app wants a limit. A `byte[]` that goes to
  the API as JSON is base64, as System.Text.Json writes it. `await e.File.RequestImageFileAsync("image/png", 400,
  400)` becomes `await requestImageFileAsync(e.file, "image/png", 400, 400)` from `@tsazor/runtime`.
- **Downloads through JS interop** (`IJSRuntime.InvokeVoidAsync("Download", new { ByteArray, FileName, MimeType })`
  and a `file.js`): a few lines of TypeScript — a `Blob` from the bytes, an object URL, a link with `download`
  clicked and removed. No interop, no script in `index.html`.
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
- **MudTable becomes the DataGrid** (BlazorHero's catalog, B23, B28).
  - `Items` with a `Filter` function: a getter that returns the filtered list, as the grid's `items`.
  - `ServerData`: the grid's `itemsProvider`, a field holding one function (not a new lambda per render). The page is
    `request.startIndex / request.count`; the sort comes from `request.getSortByProperties()`.
  - A column's `SortLabel` is its `sortKey` — a `TemplateColumn` with a `sortKey` sorts through the provider without
    a `sortBy`.
  - `HeaderContent`/`RowTemplate` pairs become columns: a `PropertyColumn` for plain values, a `TemplateColumn` with
    `Context="row"` for markup such as a `Highlighter` or an actions `Menu`.
  - `Dense`, `Striped`, `Bordered`, `Hover` are `small`, `striped`, `bordered`, `hover`.
  - `MudTablePager` is a `Paginator` on the grid's `PaginationState`: `PageSizeOptions` and `RowsPerPageString` keep
    their meaning as `pageSizeOptions` and `pageSizeLabel`, and an `InfoFormat` becomes its `summaryContent`.
  - `table.ReloadServerData()` is `grid.refreshDataAsync()` (or a page change on the PaginationState).
- **MudAutocomplete becomes Autocomplete** (B26). `T="int"` with `SearchFunc` and `ToStringFunc` over the ids:
  `TOption="number"`, `items` the ids, `optionText` the name of an id. `For`'s part in the form comes with
  `@bind-selectedOption`: the field's message after a submit, the invalid state. "No value" is `null` where
  MudBlazor's int was `0` — convert where the API wants the int.
- **Dialogs live outside the page's cascades.** As `MudDialogProvider`, the `DialogProvider` sits in the layout, so a
  shown dialog gets no `CascadingValue` a page receives (BlazorHero's hub connection). Pass what it needs as a
  parameter, or act in the page once `dialog.result` resolves.
- **Keep Blazor's `<base href="/">`** in a hand-written `index.html` (`npm create tsazor` writes one): relative URLs
  the API returns — BlazorHero's `Files\Images\…` pictures — resolve against the app's root, not the page's address.
- **Await the callbacks you invoke.** Return or await an `EventCallback`'s promise, so an async handler's error
  reaches the `ErrorBoundary` and a test can wait for it (F11, F28).
- **Builder code from data.** `addComponentParameter` (F37). Sequence numbers come from a node's place among its
  siblings (F36).
- **Smaller API shapes:**
  - `Dialog.onClosed` carries no event (F21);
  - breadcrumb items that are state, not URLs, are buttons (F25).

## From React (a team that left Blazor for React)

From the fullstackhero port ([port-fullstackhero.md](port-fullstackhero.md)): a React 19 admin on Radix, Tailwind
and TanStack Query, the client a .NET team wrote after leaving Blazor.

- **Port its Playwright suite first, and run it unchanged.** A React app's E2E tests usually mock the API
  (`page.route`) and find elements by role and name — exactly what survives a port. fullstackhero's 111 tests run
  against the Tsazor app as they are; run them against the original once in your environment first (Edge on a German
  Windows formats "129,50 $" unless started with `--lang=en-US`).
- **Framework-free code moves unchanged**: the fetch wrapper, the API modules, token storage, JWT decoding, runtime
  config, permission constants — in fullstackhero 2,200 lines, one import changed. So do cva, clsx and
  tailwind-merge: a shadcn `buttonVariants` is the same file.
- **Keep TanStack Query.** Its core (`@tanstack/query-core`) is framework-free; `useQuery` wraps a `QueryObserver`,
  and a Tsazor component subscribes to it with `observe` — a 60-line `Query` class gives `useQuery`'s semantics
  (options read on every render, a changed key switches queries, `keepPreviousData`). Mutations become async
  handlers that call `invalidateQueries`.
- **Keep the zod schemas.** `useForm({ resolver: zodResolver(schema) })` becomes an `EditForm` with
  `<StandardSchemaValidator Schema="@schema" />`; `register("name")` an `InputText` bound to the model; the error
  line reads the field's message from the EditContext. Submit the schema's parsed values (`schema.parse(model)`), as
  `handleSubmit` does — zod's `.trim()` is a transform.
- **shadcn components become your own `.tsazor` files**, as shadcn means them to be: the same classes, the behavior
  from @tsazor/ui (focus trap, dismissal, roving focus, anchored positioning). Radix's compound parts
  (`Dialog`/`DialogContent`/`DialogTitle`) become components that share the root through a cascading value.
  `asChild` has no counterpart — put the variants on the element: `<a class="@buttonVariants({ variant: "outline" })">`.
- **Radix's Portal is the browser's top layer.** An overlay inside a `backdrop-blur` header or a translated dialog
  is placed and clipped by that ancestor unless it leaves it. The skins' overlays are in the top layer already; an
  overlay of your own takes `@attach="topLayer"` from @tsazor/ui as its first attachment, which lifts it above the
  page without moving it in the DOM, and `raiseInTopLayer` keeps the toasts above a dialog opened after them (F2).
- **Props:** a `ReactNode` prop becomes a text parameter plus a `…Content` slot (Blazor's `Title`/`TitleContent`);
  `value`/`onChange` becomes `value`/`valueChanged` (`@bind-value`); a context provider (`useTheme`, `useAuth`)
  becomes a service the component injects and observes.
- **JSX → Razor:** `className` → `class`, `{cond && <x/>}` → `@if (cond) { <x/> }`, `.map(...)` →
  `@foreach (const x of xs)` with `@key`. A trap: Razor reads `Overview@if (…)` as an email address (an `@` after a
  letter is text; write `<text>Overview</text>@if (…)`). `const body = <div/>` is a Razor template in `@code`,
  `private readonly body: RenderFragment = @<div/>;` — and `(row) => <tr/>` is `(row: Row) => @<tr/>` (F3);
  `footer={cond ? <x/> : undefined}` is `Footer="@(cond ? footer : undefined)"` over one (F17). A cva variant type
  stays as it is: a parameter typed
  `VariantProps<typeof buttonVariants>["variant"]` takes `variant="outline"` as text, and `tsazor check` checks it
  against cva's variants (F1).
- **Routes:** each page's `@page` replaces the route table; nested routes with an `<Outlet/>` become nested layouts;
  `ProtectedRoute` is `AuthorizeRouteView` + a redirect to the login that keeps "where from" in the history entry's
  state (`historyEntryState`, React Router's `location.state`); `React.lazy` pages are lazy routes
  (`tsazor({ lazyRoutes })`).
- **The `@/` alias keeps working**: Tsazor follows tsconfig `paths` (F4, F13); Vite's `resolve.alias` resolves it in
  the bundle.
- **Hooks map onto a component's lifecycle:**
  - `useState` → fields; `useMemo` → getters (keep fallbacks stable: `data ?? Page.empty`, not `?? []`, or a draft
    that resyncs on identity resets on every parent render);
  - `useEffect(…, [open])` that resets a form → `onParametersSet` comparing with the previous value;
  - a mount fetch → an async `onInitialized` (the loading state renders first);
  - a stale async effect → an identity check plus `disposeSignal.aborted`;
  - `useMutation` → an async handler with a `pending` field in try/finally (`mutate()` swallows errors: catch and
    toast them yourself);
  - `useSearchParams` → `@SupplyParameterFromQuery()` fields, and `navigateTo(nav.getUriWithQueryParameter(…))` to
    change one (the page instance stays, inputs keep their focus);
  - a hook that holds state → a class with `subscribe` that the component `observe`s.
- **Forms:** react-hook-form's `register()` binds per keystroke, InputText on `change` — a live preview or an
  `isDirty`-gated Save takes `<InputText immediate>`, which also re-validates per keystroke while the field has a
  message, as react-hook-form's reValidateMode (F15). react-hook-form focuses the first invalid field after a failed
  submit; EditForm doesn't, so put a `<FocusOnInvalidSubmit />` in the form (F16). Playwright's `fill` fires no
  `change`: without `immediate` the bound value arrives with the next action's blur. react-hook-form shows messages only after the first submit; Blazor's timing shows a field's
  message when it is left.
- **A controlled input that rejects a keystroke** (`onChange={e => setYear(e.target.value.replace(/\D/g, ""))}`):
  React writes the state back into the DOM after each change; Tsazor and Blazor write `value` only when the rendered
  value changes, so "20x" stays on screen while the model holds "20". Put the cleaned value back into
  `event.target.value` in the handler.
- **Markup details:**
  - JSX drops whitespace-only text that contains a line break; Razor keeps it as a space — write `Advanced<span>`
    and `<pre><code>@json</code></pre>` on one line;
  - React renders `aria-expanded={false}` as `"false"`; Razor omits a false attribute — write
    `aria-expanded="@(open ? "true" : "false")"`, and a bare JSX `aria-hidden` as `aria-hidden="true"`;
  - React's `autoFocus` calls `focus()` on mount; HTML's `autofocus` works only on a document's first load — focus
    from an `@attach` or `onAfterRender` (a dialog's focus trap honors `[autofocus]`);
  - React Router's `NavLink` takes a `className` function of `isActive`; Tsazor's (Blazor's) NavLink sets `aria-current`
    — write the active classes as Tailwind's `aria-[current=page]:` variants, with `activeClass=""`;
  - `dangerouslySetInnerHTML` → `@(new MarkupString(html))`;
  - a module's top-level helpers and types → a sibling `.ts` file or static members (a `.tsazor` has no module scope);
  - a component named `Row` may collide with one in an `@using` namespace — name it after what it is.
- **Compare computed styles, not the source.** A library that injects its stylesheet unlayered (sonner) wins over the
  app's overrides in a Tailwind layer, whatever their specificity: the original's toasts didn't look like its CSS
  said (F20).
- **Lazy pages compile on first request in the dev server**: a test run that opens them all at once times out —
  `server.warmup` compiles them at startup.

## Tests

- **bUnit becomes `@tsazor/testing`.** `waitUntilIdle` names the work it still waits for (F35). A Virtualize
  renders its rows up to `MaxItemCount`, as with bUnit.
- **A test DOM has no layout.** Put what depends on layout (virtualization, anchoring, scrolling, painted frames)
  in browser tests (Playwright). Run them in all three engines. Under Bootstrap, scroll with `behavior: "instant"`
  before measuring: its reboot scrolls smoothly (L10).

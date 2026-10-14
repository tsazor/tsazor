# Changelog

Notable changes to the published `@tsazor/*` packages. A change to a package's public API
(`api/<package>.api.d.ts`, checked in CI by `pnpm api:check`) needs an entry here.

## Unreleased

- **Breaking — the public API is what the stability promise covers** (`docs/support-policy.md`, D-S7; the API review,
  `docs/api-review-1.0.md`):
  - `@tsazor/runtime`: **ComponentBase's plumbing is private.** `renderHandle`, `componentServices`,
    `stateHasChangedInternal` and the other renderer hooks are gone from components; the renderer and the runtime's
    own components reach them through `componentInternals` in `@tsazor/runtime/internal`. A component's `@code` may now
    use those names (TZS031 reserves only the deliberate API). `applyParameterValues` is `protected`. Library
    components call `stateHasChanged()`.
  - `@tsazor/runtime/internal` (new, not covered by the promise): `Renderer`, `ComponentState`, `DomRenderer`,
    `Dispatcher`, `RenderHandle`, `RenderError`, the diff (`computeDiff`, `RenderTreeEditType`, …), and helpers apps
    never used: `toComponentDefinition`, `isComponentDefinition`, `IErrorBoundary`, `SectionRegistry`,
    `SectionOutletContentRenderer` (no longer a tag), `headSectionId`, `titleSectionId`, `focusBySelector`,
    `getRouteTable`, `RouteTable`, `matchRoute`, `parseRouteTemplate`, `isLazyRoute`, `queryParametersOf`,
    `validationRulesOf`, `standardSchemaField`, `watchAuthenticationState`.
  - `FrameType`, `EventHandlerFlags` (and the internal `RenderTreeEditType`) are real enums: a `declare const enum`
    can't be used under `isolatedModules` (TS2748), i.e. in a Vite app.
  - `@tsazor/testing`: `RenderResult` has no `renderer` any more; `settle()` waits for the render. `container` and
    `instance` are `readonly`.
  - `@tsazor/compiler`, `@tsazor/workspace` and `@tsazor/lsp` are internal packages: their programmatic APIs serve
    Tsazor's tools, released in lockstep (snapshots in `api/*.internal.api.d.ts`).
  - The pre-1.0 aliases are gone: `NavLink`'s `cssClass` (write `class`), `Virtualize`'s `itemTemplate` and
    `overscan` (`ItemContent`/`ChildContent`, `OverscanCount`), `NavigationOptions.replace` (`replaceHistoryEntry`),
    `LocationChangedEventArgs.isIntercepted` (`isNavigationIntercepted`), `NavigationManager.toAbsolute`
    (`toAbsoluteUri`), `EditContext.subscribe` (`onValidationStateChanged.subscribe`; to observe it,
    `observe(editContext.onValidationStateChanged)`), and the DI option `{ singleton }` (`{ lifetime: "singleton" }`,
    `{ lifetime: "transient" }`; singleton stays the default).
  - `createTsazorApp` returns the exported `TsazorApp` without `renderer` (tests: `rendererOf(app)` in
    `@tsazor/runtime/internal`).
  - The types the public API names are exported: `TsazorApp`, `EventSubscription` (EditContext's events are
    subscriptions now; only EditContext invokes them), `DataAnnotationsValidationOptions`,
    `ValidationMessagesLocalizer`, `AuthenticationStateChangedHandler`, `AuthenticationStateSubscribeOptions`,
    `ParameterDecoratorContext`, `QueryParameterDecorator`, `FieldRuleDecorator`, `ValidationMessageOverride`,
    `ValidationMessageContext`, `ValidationRuleParams`. `ErrorBoundaryBase` no longer names `IErrorBoundary`.
  - Classes apps extend keep their state in `#private` fields (`AuthenticationStateProvider`, `InputBase`,
    `ErrorBoundaryBase`): a subclass may use those names.
  - `@tsazor/vite-plugin`: the root entry exports `tsazor` (also the default) and `TsazorPluginOptions` only. The
    options `staticMarkup` and `renderHints` (one-release escape hatches) are gone; `optimize: false` turns every
    compiler optimization off.
  - `@tsazor/dotnet`: the HTTP helpers (`buildResult`, `sendForResult`, `unwrapEnvelope`, `parseBodyText`, …,
    `HTTP_METHOD`, `HttpBody`) and the generator's internals (`main`, `flattenAllOf`, `resolveSchemaRef`, …,
    `OpenApiMethod`) are no exports any more; `HttpMethod` is a plain union. `JwtClaims` holds JSON values
    (`JwtClaimValue`: booleans, objects, lists as real tokens carry them); an object claim's `Claim.value` is its JSON
    text, not `"[object Object]"`.
  - `@tsazor/charts`: the chart math (`linePath`, `arcPath`, `pieSlices`, `chartSummary`, …) is no export any more;
    for an app's own SVG chart the guide recommends a layout library (d3).
  - `@tsazor/worker`: `WorkerConnection` is no export; `WorkerOptions` is `DefineWorkerOptions` (lib.dom has a
    `WorkerOptions`); `WorkerProxy` leaves out API functions named `terminate`, `dispose`, `then` or `constructor` (the
    client's own).
  - The runtime's published declarations leave out what is marked `@internal` (`stripInternal`): Virtualize's measuring
    state, EditContext's field-state bookkeeping, NavigationManager's holds and `setNavigationLock`,
    `AuthenticationStateProvider.peekState`, and more. `EditContext.notifyValidationStateChanged` is public (Blazor's
    API for custom validators); `EventCallback.bindWith` and `RenderTreeBuilder.reuseKeyed` stay as the compiler's
    ABI.
- **Breaking — the API review's decisions** (`docs/api-review-1.0.md`, Part 3; owner: "alle nach Empfehlung"):
  - `@tsazor/runtime` (D1): `InputBase`'s `Value`, `ValueChanged`, `ValueExpression` are `value`, `valueChanged`,
    `valueExpression`; `ValidationMessage`'s `For` is `for` (TypeScript's camelCase; markup matches parameters
    case-insensitively, so `@bind-Value` and `For="…"` stay). A custom input writes `this.value`. `LayoutComponentBase`'s
    `Body` stays: layouts read it as `@Body`.
  - (D2) A binding's field key is its path below the model: `model.billing.street` ⇒ `"billing.street"` (was
    `"street"`), `model.items[0].name` ⇒ `"items.0.name"` — the key `StandardSchemaValidator` gives a nested issue,
    whose messages now reach the nested input. One level (`model.title` ⇒ `"title"`) is unchanged. `EditForm`'s
    `validators` and `ValidationMessage`'s `for` name nested fields by path. The unused `FieldIdentifier` type is gone.
  - (D3) `addLocationChanged`'s handler gets the event only (no `sender`); `registerLocationChangingHandler` and
    `enableDataAnnotationsValidation` return the function that removes them (no `{ dispose() }`;
    `DataAnnotationsValidationSubscription` is gone); `NavigationManager.subscribe` makes it a source for
    `observe(navigation)`.
  - (D11, T3) `tsazor check` reports a tsconfig that isn't strict as the error TZS033 (was the warning `TSZSTRICT`):
    strict is the only supported configuration. The check's other codes are TZS034 (a file not readable, was
    `TSZECHECK`) and TZS035 (the compiler failed, was `TSZE000`); all are in the diagnostics reference.
  - (D12) A policy may decide asynchronously, as Blazor's `AuthorizeAsync`: `AuthorizationPolicy` returns
    `boolean | Promise<boolean>`, and so does `AuthorizationService.isAuthorized`. Policies are registered with
    `addPolicy(name, policy)` (the `policies` record is gone). `AuthorizeView` and `AuthorizeRouteView` show
    `Authorizing` while an async policy decides. `defaultAuthorizationService` is no export any more (an app with
    policies registers its own service).
  - `@tsazor/ui`, `@tsazor/fluent`, `@tsazor/bootstrap` (D4): dates and numbers format in the `CultureService`'s
    culture, as Blazor's `CurrentCulture` does, then (for the invariant culture) in the page's `lang` — before, the
    texts followed the culture and the dates the page, so German labels came with US dates. Calendar, DatePicker,
    TimePicker and RatingDisplay re-render when the culture changes; a `locale` parameter still wins.
    `LibraryTexts.locale` is that locale; `pageLocale` is in `library-texts`.
  - `@tsazor/bootstrap` (D5): the default `intent`s are the Fluent skin's, so a skin switch keeps every button's look:
    a `Badge` is `primary`, a `Button` and a `Dropdown` `secondary` (before: `secondary`, `primary`, `primary`). A
    button that should stand out says `intent="primary"`.
  - `@tsazor/dotnet` (D14): the doc of `HttpResult` says what the generated client does: an HTTP status is a result
    (`ok: false`), a network error or an abort rejects.
  - `@tsazor/dotnet` (D13): every generated method takes `options?: RequestOptions` last — an `AbortSignal` and the
    headers of this request (`OpenApiClient.call` takes them as its fourth argument); regenerate a checked-in client to
    get them. Header and cookie parameters, which the signatures leave out, are named in a warning.
    `--path-value version=1` (`pathValues`) writes a fixed path value into the URLs and leaves it out of the
    signatures and the names: URL-segment API versioning (`api/v{version}/…`, BlazorHero's B4). The README documents
    the naming rules as the contract: in 1.x the same document gives the same names.
  - The component manifest across versions (D10, `docs/component-libraries.md`): `tsazorComponentManifest` stays 1
    in 1.x, a minor adds optional fields only, a reader ignores the fields it doesn't know. A manifest that can't be
    read is the error TZS036 in `tsazor check` (before: silent, its tags unresolved); a newer format version is the
    warning TZS036, and its components are read as far as this version knows them. The Vite plugin prints both
    once. A test reads a manifest written by 1.0 in every later 1.x.
- **Fixed — `@tsazor/dotnet`: a generated client used neither the `baseUrl` nor the `defaultHeaders` of its
  `TsazorHttp`** — a relative path went to the page's origin, so `--base-url` (which generates
  `new TsazorHttp({ baseUrl })`) did nothing. The client's own `baseUrl` option still wins; the call's headers win over
  the defaults. `TsazorHttp` has `baseUrl` and `defaultHeaders` (read-only, HttpClient's `BaseAddress` and
  `DefaultRequestHeaders`).
- **Breaking — the tools need Node 22.12 or later** (`engines.node` of cli, compiler, workspace, lsp, vite-plugin,
  dotnet and create-tsazor; before: 20.19). Node 20 reached its end of life on 2026-04-30; the support policy
  (`docs/support-policy.md`) follows the Node.js LTS lines.
- **Release:** every release has a CycloneDX SBOM of its packages and their dependencies (`pnpm release:sbom`;
  the release workflow attests it for the tarballs), and the repository a `SECURITY.md` with the disclosure process.
  `@tsazor/fluent-icons`, `@tsazor/bootstrap-icons`, `@tsazor/fluent` and `@tsazor/bootstrap` carry the license of the
  icons they are generated from (Fluent System Icons, Bootstrap Icons; both MIT) in their `LICENSE`.
- **Licenses:** `THIRD-PARTY-NOTICES.md` lists the projects Tsazor takes code from (Blazor, Fluent UI Blazor, Fluent
  UI's tokens, the icon sets, the ported apps) with their MIT notices; `@tsazor/runtime`, `@tsazor/ui` and
  `@tsazor/fluent` carry theirs in their `LICENSE`.
- `@tsazor/compiler` (Blazor parity): **Razor templates in `@code`** — `@<tag>…</tag>` is a `RenderFragment`
  (`private readonly footer: RenderFragment = @<footer>…</footer>;`), and a lambda over one a `RenderFragment<T>`
  (`(pet: Pet) => @<li>@pet.name</li>`), as Blazor's templated delegates. The template reads the component's members
  and the names the code declares around it (a lambda's parameters, a method's locals); `tsazor check` types its
  markup. A slot left out conditionally is a value then: `Footer="@(cond ? footer : undefined)"`. In an inline
  `@{ }` block a template is TZS015, which points to `@code`. `maskedCode` (the code with its templates masked) and
  the `RazorTemplate` node are exported for tools that read `@code` with TypeScript.
- **Behavior — `@tsazor/ui`, `@tsazor/fluent`, `@tsazor/bootstrap`: the overlays are in the browser's top layer**
  (Radix's Portal without a portal; the DOM and the component tree stay): `topLayer`, an attachment that shows the
  element as a manual popover and undoes the popover's own box at zero specificity (a constructed sheet, no
  `<style>`), and `raiseInTopLayer` / `showInTopLayer` / `hideFromTopLayer`. Both skins put Dialog, Drawer (and
  their backdrops), Popover, Menu/Dropdown, the full-screen Overlay, the ToastRegion and the popups of Autocomplete,
  DatePicker, TimePicker, ColorPickerInput and Overflow there, and @tsazor/ui its tooltips and the sortable list's
  drop indicator: an ancestor's `transform`, `filter`, `backdrop-filter` or `overflow` no longer moves or clips them,
  and no z-index can cover them. They stack in the order they open; the toasts show themselves on top again when a
  toast arrives after an overlay opened. Without the Popover API (a DOM test environment) nothing changes.
- `@tsazor/dotnet`: **an envelope's success flag** — `--envelope data,messages,succeeded` (`EnvelopeOptions.succeeded`)
  for APIs whose `Result<T>` says `succeeded: false` with HTTP 200 and carries messages on a success too ("Product
  Saved"): the flag decides, a success's messages are no failure. Without the flag the failure side decides, as
  before.
- `@tsazor/runtime`: **`immediate` on `InputText` and `InputTextArea`** (MudBlazor's `Immediate`; react-hook-form's
  `register()`): the value binds on every keystroke, the form hears of the field change on `change` as before — and,
  while the field has a message, on every keystroke, so the message goes as soon as the value is fixed
  (react-hook-form's reValidateMode). `InputBase.addImmediateHandlers` gives an own input the same handlers.
- `@tsazor/runtime`: **`<FocusOnInvalidSubmit />`** inside an `EditForm` focuses the first invalid field after a
  submit that found errors (react-hook-form's `shouldFocusError`; Blazor's EditForm leaves the focus on the button).
  Named after `FocusOnNavigate`; `selector` (default `[aria-invalid="true"]`) picks the fields, in form order.
- **Breaking — `@tsazor/fluent`: `FluentProvider`'s theme defaults to `"system"`** (Fluent UI Blazor's
  `DesignThemeModes.System`): `theme: "system" | "light" | "dark"`. `"system"` follows the OS's preference, or the
  theme an ancestor pins; `"light"` now pins light, even under the OS's dark mode or inside a dark subtree (before, it
  was the default and meant "inherit"). `data-fluent-theme="light"` pins light on any element, `"system"` on `<html>`
  follows the OS. An app with its own dark-mode switch no longer needs `data-fluent-theme="light"` on `<html>`. The
  OS's dark mode now has all of the explicit dark theme's values (the neutral ramp, the shadows and the accent's
  hover/active steps were the light ones), and the theme-dependent aliases (`--fui-accent*`,
  `--fui-brand-background*`, `--fui-flyout-shadow`) follow the nearest theme in nested providers.
- **Breaking — `@tsazor/compiler`, `@tsazor/workspace`, `@tsazor/vite-plugin`: `@authorize` in `_Imports.tsazor` is
  inherited** (Blazor's `@attribute [Authorize]` in `_Imports.razor`): it protects every page below it, and a page's
  own `@authorize` adds to it (sign-in from `_Imports` plus a page's policy). The new directive **`@allowAnonymous`**
  (Blazor's `[AllowAnonymous]`) opts a page — or, in an `_Imports.tsazor`, a folder — out of all of them; the TZS021
  fix for `@attribute [AllowAnonymous]` now writes it. A role list (or policy) inherited next to the page's own is
  TZS019. Before, `@authorize` in `_Imports` had no effect (TZS014). `CompileOptions.inheritedAuthorization`,
  `inheritedAuthorizationOf` and `FileContext.inheritedAuthorization` carry the chain's directives.
- **Breaking — `@tsazor/compiler`: computed parameter types take text as text** (Razor decides from the real type):
  a parameter typed with an indexed access (`VariantProps<typeof buttonVariants>["variant"]`), a conditional or
  mapped type, `typeof`, `keyof` or a lib utility over one lowers `variant="outline"` as the text `"outline"`, as a
  `string` parameter, and `tsazor check` checks it against the real type — no TZS026. Before, such a type counted
  as a value and the text as an expression (`TS2339 Property 'outline' does not exist`). A computed type that is
  not text takes `@` (`Count="@5"`). `NonNullable<T>`, `Readonly<T>`, `Exclude<T, …>` and `Extract<T, …>` take T's
  category, `Uppercase<…>` and its kin are strings.
- **Breaking (CSS) — `@tsazor/runtime`: `ValidationSummary` renders Blazor's markup:** `<ul class="validation-errors">`
  with a `<li class="validation-message">` per message (before: `ul.validation-summary` and bare `li`s). As in Blazor,
  the class replaces a passed `class`; the other attributes pass through. Rename `.validation-summary` in your CSS; a
  Blazor app's `.validation-errors` / `.validation-message` rules now apply as they are.
- `@tsazor/runtime`: **`StandardSchemaValidator`** — an EditForm validates its model with a Standard Schema: a zod
  (3.24+), Valibot or ArkType schema, react-hook-form's `zodResolver` in Blazor's shape (Blazored.FluentValidation's
  `<FluentValidationValidator />`). Issues become the fields' messages by their path (`["address", "city"]` →
  `address.city`; none → the model's); a field change updates that field's, a submit all of them. The
  `StandardSchemaV1` interface (the spec's, no dependency), `StandardSchemaResult`, `StandardSchemaIssue` and
  `standardSchemaField` are exported.
- `@tsazor/runtime`, `@tsazor/compiler` (Blazor parity): **nested layouts** — a layout's own `@layout` is followed,
  as Blazor's LayoutView follows `[Layout]`: a Settings layout with `@layout MainLayout` renders inside it, and the
  outer layout keeps its instance across pages that share it. The compiler emits a component's own `@layout` as
  `static layout`; `RouteView`, `LayoutView` and `AuthorizeRouteView` wrap outward along the chain, and RouteView
  takes the page's own layout when the route gives none.
- `@tsazor/runtime` (Blazor parity): `NavigationManager.getUriWithQueryParameter(name, value)` and
  `getUriWithQueryParameters([uri,] parameters)`, Blazor's NavigationManagerExtensions — set, replace (in place, names
  case-insensitive) or remove (null) query parameters, arrays as repeated keys, the fragment kept; booleans as Blazor
  writes them (`True`), dates as ISO 8601 (what `@SupplyParameterFromQuery()` reads back). `QueryParameterValue` is
  exported.
- `@tsazor/runtime`: `RenderTreeBuilder.addAttribute` also takes a value typed `unknown` (Blazor's `object?`): in
  `tsazor check`, `payload="@event.payload"` on a parameter typed `unknown` failed with TS2345.
- `@tsazor/runtime` (Blazor parity): `InputBase` offers Blazor's `cssClass` (the caller's class and the validation
  class) and `attributesWithValidation` (the attributes with Blazor's aria-invalid rule) for a component that inherits
  an input and renders its own markup.
- `@tsazor/lsp` (`tsazor check`, the language server): a `.tsazor` imported through tsconfig `paths`
  (`@import AppShell from "@/components/layout/AppShell.tsazor"`) is typed as its class, not as a `ComponentType`.
- `@tsazor/runtime` (Blazor parity): the inputs (`InputBase`) carry `aria-invalid="true"` while their field has
  validation messages, as Blazor's — a caller's own `aria-invalid` is kept then, and dropped while the field is valid.
- `@tsazor/runtime` (Blazor parity): `NavigationManager.historyEntryState`, Blazor's `HistoryEntryState`: the state
  the navigation to the current entry passed, restored on back and forward and after a reload.
- `@tsazor/workspace` (the compiler's metadata, the Vite plugin, `tsazor check`, the language server): an app's
  tsconfig `paths` are followed — `@/components/ui/Button.tsazor`, `@/api/users` (the `@/*` alias shadcn and Vite's
  React template set up). A parameter typed from such a module was "unknown" (TZS026) and `count="5"` passed "5".
- `@tsazor/fluent`, `@tsazor/bootstrap`: `Typography`'s `as` picks the element apart from the style (MudText's
  `HtmlTag`, Fluent UI React's `as`): `<Typography variant="h5" as="h1">` is a page's h1 in an h5's size. The
  Bootstrap skin gives the element Bootstrap's heading class (`<h1 class="h5">`).
- **The component library's own texts are localizable** (B29): a dialog's "Close", the paginator's "Page 2 of 7",
  the grid's "Loading…", a chip's "Remove …", the calendar's "Next month", a sortable list's announcements, … Each
  has a reserved key `tsazor.ui.<name>` in the app's string tables, English when it is missing, as the validation
  messages' `tsazor.validation.*` (MudBlazor's MudLocalizer, Fluent UI Blazor's IFluentLocalizer). Counted texts go
  by the culture's plural rules (`….one`, `….few`, `….other`). The components re-render on a culture change. The
  catalog is `@tsazor/ui`'s `libraryTextDefaults`; `libraryTexts()`, `libraryText`, `libraryPlural`,
  `englishLibraryTexts` and the label builders (`calendarLabelsFrom`, `carouselLabelsFrom`, …) are exported. The
  skins' text parameters with an English default — `ariaLabel` of Paginator, Pagination, Wizard, Carousel, Rating,
  ColorPicker, ScrollToTop, SidebarNav, `emptyText`, `pageSizeLabel`, `buttonLabel`, `progressLabel`, the Wizard's
  `labelPrevious`/`labelNext`/`labelDone`, the Spinner's `ariaLabel` — are optional now: unset is the library text;
  set, they still win. `describeColor`, `dateFieldPlaceholder` and `timeFieldPlaceholder` take the texts as an
  optional last argument (German writes TT.MM.JJJJ); `FileUploadLabels` gains the optional `fileCountExceeded` and
  `fileSizeExceeded` messages. Screen-reader role descriptions ("carousel", "slide", "2D slider") are library texts
  too. `@tsazor/runtime`:
  `StringLocalizer.raw` is documented as public — the lookup without formatting and without the missing-key warning.

- `@tsazor/fluent`, `@tsazor/bootstrap`: the `Autocomplete` takes part in a form as the inputs do (MudAutocomplete's
  `For`): `@bind-selectedOption`/`@bind-selectedOptions` pass the field (`selectedOptionExpression`,
  `selectedOptionsExpression`), a pick notifies the EditContext, and after a submit the field shows its message,
  with `aria-invalid`. The `Paginator` offers the rows per page with `pageSizeOptions` and `pageSizeLabel`
  (MudBlazor's TablePager); `@tsazor/ui`'s `PaginationState.setItemsPerPageAsync` goes back to the first page and
  reloads the grid. A `TemplateColumn` with a `sortKey` and no `sortBy` sorts through an ItemsProvider (the server
  orders by the key; QuickGrid reads that name from SortBy's expression, which TypeScript has none of).
- `@tsazor/fluent`: a DataGrid column's `align="end"`/`"center"` reaches its header too (the table's header rule
  kept it at the start).
- `@tsazor/runtime`: `@CascadingParameter({ type })` takes any class (`CascadingTypeToken`), also one whose
  constructor is private — SignalR's HubConnection comes from a builder and didn't compile as a type token.
  `ParameterMeta.cascadingType` has that type too.

- `@tsazor/runtime`: `requestImageFileAsync(file, format, maxWidth, maxHeight)`, Blazor's
  `IBrowserFile.RequestImageFileAsync`: the image scaled to fit (never enlarged) and written as `format` by the
  browser's canvas; name and last-modified time stay. Unlike Blazor's, an unreadable image rejects instead of never
  settling. `InputFile` does what Blazor's InputFile.ts does: a click empties the input, so the same file chosen
  again raises `onChange`, and a cancelled file dialog raises `onChange` with no files. Blazor's InputFile E2E suite
  runs in the parity gate (six of seven tests; `OpenReadStream`'s size cap has no counterpart).

- `@tsazor/runtime`: a component re-renders on a culture change through one subscription, however often it injects
  the `StringLocalizer` or the `CultureService` (two localizers in field initializers, `this.inject` in a lifecycle
  method that runs on every parameter set). Before, each call subscribed again and warned "observed twice" in DEV.
- `@tsazor/fluent`, `@tsazor/bootstrap`: a `SidebarNav` link takes a `target` (MudBlazor's `MudNavLink Target`):
  `"_blank"` opens it in a new tab, outside the app's routing. `AppLayout` without `nav` renders no column — the
  header over the page, as a signed-out page has it.
- `@tsazor/fluent`: `FluentProvider`'s `tokenOverrides` reach the tokens made of others. `--fui-accent`,
  `--fui-brand-background` (and their hover and pressed steps), the gaps, the control heights and the dialog shadow
  were resolved on `:root` only, so overriding the brand ramp left buttons, headers and links in Fluent's blue in the
  light theme. They are declared on every provider now and resolve against its overrides.
- `@tsazor/fluent`: `AppLayout`'s transparent and subtle header buttons take the header's ink and darken the brand
  on hover (they kept a light surface's gray). The toasts show their intent's accent bar: the rule used CSS
  properties that don't exist, so no toast had one.

- **`AuthorizeRouteView` renders `NotAuthorized` and `Authorizing` in the default layout**, as Blazor's does
  (`RenderContentInDefaultLayout`), and shows Blazor's "Not authorized" / "Authorizing..." when the app gives none.
  Before, they rendered without a layout and empty by default. The layout stays mounted when access turns granted.
- `@tsazor/cli`, `@tsazor/dotnet`: the version is read when `--version` asks for it. 1.0.0-next.1 read it while
  loading the module, so a bundler that loaded `@tsazor/dotnet`'s generator failed ("The URL must be of scheme file").

- `@tsazor/fluent`, `@tsazor/bootstrap`: `SidebarNav` takes `sections` — links under headings (MudBlazor's
  `MudListSubheader`, Fluent UI Blazor's `FluentNavGroup`), each a group named by its heading, after `links`. The
  icon rail hides the headings. Both skins re-export `DialogService` and `DialogReference`, and the types
  `DialogOptions`, `DialogParameters`, `DialogResult` and `ToastAction`.

- **Dialogs from code** (MudBlazor's `IDialogService`, Fluent UI Blazor's and Radzen's `DialogService`):
  `@tsazor/ui`'s `DialogService.show(Component, { title, parameters, size, closeOnEscape, closeOnBackdrop })` returns
  a `DialogReference` whose `result` the page awaits (`{ canceled, data }`); the dialog gets the reference as a
  cascading value and calls `close(data)` or `cancel()`. Both skins add `DialogProvider` (place it once in the
  layout; their `tsazor.setup` lists it, so the starter does) and a hosted mode of `Dialog`: without `isOpen` it is
  the frame of the shown dialog — show's title, size and closing rules, and Escape, the backdrop and Close cancel.
  `Dialog`'s `isOpen` is optional now (unset is closed, as before, outside a shown dialog). `addFluent` and
  `addBootstrap` register the service.

- `@tsazor/fluent`, `@tsazor/bootstrap`: `AppLayout`, the app's frame (MudBlazor's `MudLayout` with `MudAppBar`, a
  persistent `MudDrawer` and `MudMainContent`; Fluent UI Blazor's `FluentLayout`): a `header` bar, a `nav` column
  and the page as `<main>`. `@bind-navOpen` shows or hides the column; in a window narrower than 960px it starts
  closed and lies over the page, and Escape or a click on the page closes it.

- `@tsazor/fluent`, `@tsazor/bootstrap`: `TextInput` takes `contentBefore` and `contentAfter` — an icon or a button
  inside the field (MudBlazor's adornments, Fluent 2's Input slots), such as the password field's show/hide button.
  Fluent draws one field box around them; Bootstrap makes an input group. A field without them is unchanged.

- `@tsazor/fluent`, `@tsazor/bootstrap`: `Menu`/`Dropdown` takes `labelContent` — any content for its toggle, such
  as the user's avatar (MudBlazor's `ActivatorContent`) — and `ariaLabel` to name it. `@tsazor/ui`: a toast can
  carry an action (`show({ action: { label, onClick } })`, MudBlazor's snackbar `Action`); `Toaster.act(id)` runs it
  and closes the toast, and both skins' `ToastRegion` render its button.

- `@tsazor/dotnet`: `attachJwtAuth(http, provider, { refresh, refreshBefore })` renews the access token before a
  request when it expires within a minute (the refresh-token pattern Blazor apps build into a `DelegatingHandler`):
  once per token while the other requests wait; a refresh that fails logs out; a sign-in meanwhile wins.

- `@tsazor/runtime`: `StringLocalizer` walks the parent cultures before the default (`fr-FR` → `fr`), as .NET's
  resource lookup does: a table for the neutral culture serves its specific ones.

- `@tsazor/dotnet`: `tsazor-dotnet generate <url>` asks for `application/json` in English. Node's fetch sent
  `accept-language: *`, which BlazorHero's server answers with a 500; a fixed language also keeps a localizing
  server's output the same on every machine.

## 1.0.0-next.1 (2026-10-12)

- **Every package has one version** (lockstep, docs/design-release.md): `1.0.0-next.1` is the first prerelease, in a
  local registry until the repository is public. The packages carry a README, a LICENSE and their repository; the
  tools need Node 20.19 or later. `tsazor --version` and `tsazor-dotnet --version` report the package's version
  (they said 0.2.0 and 0.1.0). No package ships its `.tsbuildinfo` any more.

- `@tsazor/fluent`: `fluent.css` sets the document's typeface at zero weight (`:where(body)`), so text outside the
  components reads in Fluent's type and any rule of the app's own still wins. `create-tsazor`: with a library that
  brings styles, the new app's `app.css` leaves the template's Helvetica out (F16; it beat the library's typeface).

- `@tsazor/dotnet`: a JWT without any name claim (only `oid`, say) signs in, with an empty name, as .NET's identity
  is authenticated while its `Name` is null. It counted as signed out before.

- `@tsazor/dotnet`: `CookieAuthenticationStateProvider.refresh()` asks the session endpoint again after a sign-in or
  sign-out through the app's own form (F10): the auth components show `Authorizing` until the answer, no reload.

- **Breaking — `TsazorHttp` unwinds response interceptors like .NET's handler chain:** the one added last sees the
  response first (request interceptors still run in the order added). An interceptor added after one that throws on
  an error status sees the response now; `attachJwtAuth` goes after the app's own error handling.
- `@tsazor/runtime`: `notifyAuthenticationStateChanged` takes a promise of the state too, as Blazor's takes a
  `Task`. Until it resolves, `AuthorizeView` and `AuthorizeRouteView` show `Authorizing`; subscribers hear the
  resolved state (`subscribe` takes `{ onPending }` to hear the start); a newer notification wins; a rejected promise
  counts as signed out. `@tsazor/dotnet`: `JwtAuthenticationStateProvider.createUserAsync(claims, token)` (Blazor
  WebAssembly's `AccountClaimsPrincipalFactory.CreateUserAsync`) adds what the token doesn't carry, such as roles from
  a profile endpoint; the provider works its state out on first request instead of in the constructor.

- **Breaking — method names keep Blazor's `Async` suffix** (decided before the API freeze; design-principles.md):
  `@tsazor/runtime`'s `Virtualize` has `refreshDataAsync()` and `scrollToItemAsync(index, signal?)` (were
  `refreshData`, `scrollToItem`); `@tsazor/fluent` and `@tsazor/bootstrap`: `DataGrid.scrollToItemAsync`, `Overlay`'s
  `showAsync()`/`closeAsync()`, `Wizard.goToStepAsync(index, validate?)`. Methods whose Blazor name has no suffix
  (a Carousel's `moveTo`, `next`, `previous`) keep theirs. `AuthenticationStateProvider.getState()` is
  `getAuthenticationStateAsync()`, Blazor's name, in `@tsazor/runtime` and `@tsazor/dotnet`'s cookie and JWT
  providers: an app's own provider renames its override.
- `@tsazor/dotnet`: `attachJwtAuth` kept only the `authorization` header — a POST lost its JSON content type (ASP.NET
  Core answered 415) and the client's `defaultHeaders`. It adds the header to the others now. It also logs out when
  the server answers the current token with a 401, so `AuthorizeRouteView` shows `NotAuthorized` (Tsazor extension;
  a 403, or a 401 to an older token, changes nothing). `@tsazor/runtime`: a `ResponseInterceptor` gets the request
  that was sent as its second argument.
- `@tsazor/dotnet`: `principalFromJwt` (and so `JwtAuthenticationStateProvider`) names the user by `nameid` too —
  `ClaimTypes.NameIdentifier` as .NET's `JwtSecurityTokenHandler` writes it. A token that names its user only there
  (FluentCMS's) decoded as signed out.
- `@tsazor/charts` (new, wave B; D-L2): `Chart` (MudBlazor's `MudChart`, its newer API) draws line, area, bar,
  stacked-bar, donut and pie charts as SVG in the skin's colors (`--tz-chart-1` … `--tz-chart-8` default to Fluent's
  or Bootstrap's tokens): `chartSeries`, `chartLabels`, `chartOptions` (`yAxisTicks`, `yAxisFormat` as a function,
  smooth lines that don't overshoot, `chartPalette`, …), `legendPosition`, `@bind-selectedIndex` (each series or
  slice a button then), `canHideSeries`. A figure named and described in words, the numbers in a table. `Sparkline`
  for a cell or a card. The math (`valueAxis`, `linePath`, `arcPath`, `pieSlices`, …) for charts of an app's own.
- `@tsazor/lsp` (`tsazor check`, the editor): an inline `type` beside a component in one `@import`
  (`{ Chart, type ChartSeries }`) kept its name; the shadow program dropped it, so the type was unknown.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave B): `TextInput` takes a `mask` (MudBlazor's
  `Mask="@(new PatternMask(...))"`): a PatternMask — `0` a digit, `a` a letter, `*` either, the rest written in
  between — or its pattern as text ("(000) 000-0000"); the text takes its shape as it is typed, the caret staying
  after what was typed; `cleanDelimiters` binds the characters only, `transform` changes them, `placeholder` shows the
  open places; a digits-only mask asks for the number keyboard. `Overflow` (Fluent UI Blazor's `FluentOverflow`): the
  items that don't fit move behind a "+N" button, named after them, which opens them in a popup where they still work
  (`items`, `itemTemplate`, `itemText`, `maxRenderedItems`, `orientation`, `moreTemplate`, `overflowTemplate`,
  `onMoreClick`). `@tsazor/ui`: `PatternMask`, `maskInput`, `toMask`, `overflowFit`.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave B): `Carousel` and `CarouselItem` (MudBlazor's `MudCarousel`;
  the WAI-ARIA carousel pattern; Bootstrap's `.carousel` without its JavaScript): a slide at a time, each a group named
  "2 of 5", previous and next, a button per slide, a swipe; `@bind-selectedIndex`, `itemsSource` with `itemTemplate`;
  `autoCycle` turns the slides every `autoCycleTime` ms, silently, but not while hovered, focused, stopped by its
  button or with reduced motion (WCAG 2.2.2). `Link` (Fluent UI Blazor's `FluentLink`, MudBlazor's `MudLink`): `href`,
  `target` (a new tab gets `noopener`), `forceLoad` (rel="external"), `appearance` subtle, `inline`, `iconStart`,
  `iconEnd`, `disabled`; without `href` but with `onClick` a button. `Image` (`FluentImage`, `MudImage`): `source`,
  `alternateText`, `width`, `height`, `fit`, `position`, `shape`, `bordered`, `shadow`, `block`, `fluid`, lazy loading.
  `ScrollToTop` (MudBlazor's `MudScrollToTop`): a button past `topOffset` that takes the page, or a `selector`'s
  element, back up. `@tsazor/ui`: `carouselStep`, `carouselRotates`, `carouselSwipe`, `carouselLabels`.

- `@tsazor/runtime`, `@tsazor/fluent`, `@tsazor/bootstrap`: an input holds its field as `element` (Blazor's
  `InputBase.Element`), so a page focuses it through its `@ref`: `search.element?.focus()` for Blazor's
  `search.Element.Value.FocusAsync()` and Fluent UI Blazor's `FocusAsync()`. The runtime's InputText, InputTextArea,
  InputNumber, InputCheckbox, InputDate and InputSelect set it, and so do both skins' TextInput, TextArea,
  NumberInput, Select, Checkbox, Switch, DateInput, Slider, DatePicker, TimePicker and ColorPickerInput.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave B): `ColorPicker` (Fluent UI Blazor's `FluentColorPicker`,
  MudBlazor's `MudColorPicker`): the color as hex text, `@bind-selectedColor`; `view` swatch (Fluent UI Blazor's
  palette, ten shades a hue) or wheel (its 127 hexagons), both radio groups whose swatches say their color's name and
  code, or hsv (a saturation and brightness square and a hue bar, sliders for the keys and the pointer); `palette`,
  `columns`, `orientation`, `findClosestColor`, `onPick`, `labels`. `ColorPickerInput` (`FluentColorPickerInput`;
  InputBase): a hex field with a button that shows the color and opens the picker in a dialog, closed by a pick
  (`hideTextInput`, `iconPalette`). `Hotkey` (MudBlazor's `MudHotkey`): a combination for the whole page ("Ctrl+K",
  "Mod+S", "?"; a plain key not while typing), `onHotkeyPressed`, content shown on the press. `KeyCode`
  (`FluentKeyCode`): the keys of its content, the page or an anchor (`only`, `ignore`, `preventDefaultOnly`,
  `stopRepeat`). `@tsazor/ui`: `parseHotkey`, `matchesHotkey`, `hotkeyApplies`, `ariaKeyShortcuts`; the colors'
  `normalizeHexColor`, `hexToHsv`, `hsvToHex`, `closestColor`, `describeColor`, `swatchKeyTarget`, `wheelKeyTarget`,
  `wheelLayout`, `swatchPalette`, `wheelPalette`. Both skins draw a palette (`Color20Regular`, `Palette`).

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave B): `Rating` (MudBlazor's `MudRating`; InputBase): stars as
  radio buttons in a named group — the arrows move the value without wrapping (Shift, Home and End to the ends), a
  click on the value's star clears it, the pointer previews (`hoveredValueChanged`); `max`, `fullIcon`, `emptyIcon`,
  `size`, `color` (neutral, brand, marigold), `readOnly`, `disabled`, `labels`. `RatingDisplay` (Fluent UI Blazor's
  `FluentRatingDisplay`): a value as stars, halves too, with the value and the number of ratings in the locale's way
  (`count`, `compact`, `shape`), one image named "Rated 4.5 out of 5, 1,234 ratings". `Highlighter` (Fluent UI
  Blazor's `FluentHighlighter`, MudBlazor's `MudHighlighter`): the search terms in a text marked (`highlightedText`,
  `delimiters`, `highlightedTexts`, `caseSensitive`, `untilNextBoundary`); the text stays text. `@tsazor/ui`:
  `ratingFill`, `ratingKeyTarget`, `ratingClickValue`, `ratingLabels`, `formatRatingValue`, `formatRatingCount`,
  `highlightFragments`, `highlightTerms`. Both skins draw stars (`Star20Filled`/`Star20Regular`, `StarFill`/`Star`).

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave B): `TimePicker` (Fluent UI Blazor's `FluentTimePicker`,
  MudBlazor's `MudTimePicker`): a text field for the time as the locale writes it ("2:30 PM", "14:30"; .NET's short
  time pattern) and a list of times from `startHour` to `endHour` every `increment` minutes, in the ARIA combobox
  pattern (the arrows open it on the value and move, Enter picks, Escape closes, the focus stays in the field).
  The value is an ISO time, `"14:30:00"`, what .NET writes for a `TimeOnly`. `disabledTimeFunc`, `locale`,
  `hourCycle` (h12, h23), `renderStyle` native (the browser's time input), `buttonLabel`; typed text is read in the
  locale's way, with AM and PM anywhere, "14h30" or the digits only. Both skins draw a clock (`Clock20Regular`,
  `Clock`). `@tsazor/ui`: `timeOptions`, `parseTimeField`, `formatTimeField`, `timeFieldPlaceholder`,
  `parseIsoTime`, `isoTime`, `initialTimeOption`, `nextEnabledOption`; the skins re-export `IsoTime` and `HourCycle`.

- `@tsazor/bootstrap`: `Accordion`, `Breadcrumb`, `BreadcrumbItem`, `CardBody`, `CardFooter`, `CardHeader`, `CardTitle`,
  `Navbar`, `Pagination`, `Spinner`, `Tab`, `Table`, `Tabs` and `ToastRegion` pass attributes through (`class`
  appends), as their Fluent twins do. `Tabs` puts its tab list and panels in one `div` for them; `Breadcrumb`'s
  `nav` is named "breadcrumb", as Bootstrap's docs show.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave B): `Overlay` (Fluent UI Blazor's `FluentOverlay`, MudBlazor's
  `MudOverlay`): a busy state over its container, or with `fullScreen` over the page as a modal dialog. What it covers
  is inert while it shows, and focus that was there moves into it and back; full screen, the page doesn't scroll.
  `closeMode` (`all`, `inside`, `outside`, `manual`) says which click closes it, and Escape does unless manual;
  `interactive` blocks nothing. `@bind-visible`, `show()`, `close()`, `backgroundColor`, `opacity`, `ariaLabel`; a
  Spinner unless `childContent` says otherwise. `@tsazor/ui`: `overlayBehavior`, `overlayClosesOn`,
  `overlayBackground`. The Bootstrap skin's `Card` passes attributes through (`class` appends), as Fluent's does.

- `@tsazor/compiler`, `@tsazor/workspace`: a component's published declaration lists its public methods
  (`DataGrid.refreshDataAsync()`, `Overlay.show()`, `Wizard.goToStep()`), so plain TypeScript — a code-behind, a test —
  calls them on a reference. `ComponentMetadata.methods` carries them; a method whose JSDoc says `@internal` (a
  child component's hook, such as `TreeView.isExpanded`) is left out. `ToastRegion.onInitialized` is protected.

- `@tsazor/workspace`: a component's published declaration types a parameter without an annotation by its literal
  initializer (`wrap = false` is `wrap: boolean`), else `unknown`. It wrote `undefined`, so plain TypeScript (a
  test's `render(Toolbar, { wrap: true })`) couldn't set it — in both skins' `Chip`, `ChipSet`, `Splitter`,
  `SplitterPane`, `Timeline`, `Toolbar` and others.

- `@tsazor/bootstrap` (wave A) catches up with the Fluent skin: `Autocomplete` (a `.form-control` with `.badge` chips
  and a `.dropdown-menu` listbox), `TreeView` (with `TreeViewItem` among its types), `CheckboxGroup` (`.form-check`)
  and `SidebarNav` (`.nav-pills`, the compact rail) — the same parameters as the Fluent skin's. Both skins'
  `Autocomplete.optionKey` returns a key `@key` takes (`string | number | object`).

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `SortableList` (Fluent UI Blazor's
  `FluentSortableList`; MudBlazor's `MudDropContainer`): items dragged into another order with any pointer, and
  between lists of one `group`, with a line where they land; and a keyboard way — Space or Enter picks the focused
  item up, the arrows move it (across to the neighboring lists of the group with the other arrows), Space or Enter
  puts it down, Escape puts it back — announced to screen readers. One tab stop per list. `@bind-items`,
  `itemTemplate`, `clone`, `drop`, `sort`, `handle` (.sortable-grab), `itemFilter`, `orientation`, `labels`,
  `onUpdate`, `onAdd`, `onRemove`. The Bootstrap skin draws a `.list-group`. `@tsazor/ui`: `sortableList`,
  `moveItem`, `sortableInsertIndex`, `SortableListEventArgs`.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `FileUpload` (Fluent UI Blazor's `FluentInputFile`,
  MudBlazor's `MudFileUpload`): a drop zone that is the label of a file input; dropped or chosen files go through an
  `upload` function (`uploadTo(url)` posts each with its progress, over XMLHttpRequest) or are read in chunks (`mode`
  buffer) or handed over (stream), with a progress bar and its text (or a `progressTemplate`), `onProgressChange`
  (cancellable), `onFileUploaded`, `onFileError` (FileCountExceeded, MaximumSizeReached, UploadFailed), `onCompleted`,
  `@bind-progressPercent`, `anchorId` and `dragDropZoneVisible`. `@tsazor/ui`: `runFileUpload`, `uploadFile`,
  `uploadTo`, `formatFileSize`; both skins re-export the uploader, `formatFileSize` and the calendar's and the
  upload's types.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `Calendar` and `DatePicker` (Fluent UI Blazor's
  `FluentCalendar` and `FluentDatePicker`, MudBlazor's `MudDatePicker`). The value is an ISO date, `"2026-10-10"`, which no
  time zone shifts. The calendar shows days, months or years (`view`; the title zooms out), honors `minDate`,
  `maxDate` and `disabledDateFunc`, selects single, multiple or a range (`selectedDates`, `selectDatesHover`), takes a
  `daysTemplate`, `pickerMonth` and `locale` (names, the week's first day), and follows the WAI-ARIA date grid on the
  keys. The date picker is a text field in the locale's format (typed dates are read in its order) with a button
  that opens the calendar in a modal dialog; Alt+ArrowDown opens it too. `@tsazor/ui`: the ISO date arithmetic
  (`addDays`, `addMonths`, `calendarWeeks`, `calendarKeyTarget`, `parseDateField`, `formatPickerValue`, …).

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `Slider` (Fluent UI Blazor's `FluentSlider`, MudBlazor's
  `MudSlider`) on a native `input type="range"` (Bootstrap's `.form-range`), bound with `@bind-value`: `min`, `max`,
  `step`, `orientation` (vertical stands it up), `size` small; the value follows the drag once it pauses
  (`immediateDelay`, 60 ms) or, with `immediate` false, waits for the release. `tickMarks` with `tickMarkLabels`,
  `valueLabel` with `valueFormat`, which is also the slider's `aria-valuetext`. Fluent fills the rail up to the thumb.
  `@tsazor/ui`: `sliderFraction`, `sliderTicks`.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `Toolbar` (MudBlazor's `MudToolBar`, Fluent UI Blazor
  v4's `FluentToolbar`; Bootstrap's `.btn-toolbar`): Buttons, Menus and fields in a row or a column that is one tab
  stop, the WAI-ARIA toolbar pattern. The arrow keys of its `orientation` move between the controls and wrap, Home
  and End jump, disabled controls are skipped; a text field keeps its arrow keys, an open menu its own. `ariaLabel`,
  `size` small (dense), `wrap`; a vertical `Divider` separates groups. `@tsazor/ui`: `toolbarFocus`, an attachment
  for any element.

- **Fix** `@tsazor/fluent`: the copy-in CLI is published (`bin`: `tsazor-fluent`), so `npx @tsazor/fluent add Dialog` runs
  from npm; before, the package left `bin/` out (L8).

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `Splitter` and `SplitterPane` (Fluent UI Blazor main's
  `FluentMultiSplitter`; also as `MultiSplitter` and `MultiSplitterPane`): panes side by side or stacked, a bar between
  each two that a drag or the keys move (the window splitter pattern: `role="separator"`, `aria-valuenow`, arrows,
  Shift, Home, End; Enter or a double-click collapses a collapsible pane, whose room goes to its neighbor). A pane's
  `size`, `min` and `max` take % or px; `onResize`, cancellable `onCollapse`/`onExpand`. `@tsazor/ui`:
  `resizeSplitter`, `splitterKeyDelta`, `splitterPercent`, `SplitterEventArgs`.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `Wizard` and `WizardStep` (Fluent UI Blazor main's
  `FluentWizard`): a step list (at the start, on top when narrow, or on top) with the current step's content and
  Previous, Next and Done. `value` is the current index (`@bind-value`); Next skips disabled steps, validates the
  step's forms (`FluentForm`/`Form` register with their step, as Fluent UI Blazor's EditForms do) and asks the step's
  `onChange` (cancellable `WizardStepChangeEventArgs`); Done raises `onFinish`. `stepSequence` linear, any or
  visited; `displayStepNumber`; `buttonTemplate`; `goToStep()`; the steps' `label`, `summary`, `disabled`,
  `deferredLoading` and bullet icons. The button texts are parameters (`labelPrevious`, `labelNext`, `labelDone`).

- `@tsazor/fluent`, `@tsazor/bootstrap` (wave A): `Timeline` and `TimelineItem` (MudBlazor's `MudTimeline`): an ordered
  list along a line, `orientation` vertical or horizontal, `position` alternate (default), start or end, `align`,
  `reverse`; an item's `itemContent` (or child content), `itemOpposite` (a date) and dot (outline or solid, an
  `intent`, small to large, an `icon`, `itemDot` or `hideDot`). The items share the timeline's tracks (CSS subgrid),
  so the dots line up.
- `@tsazor/bootstrap` has a stylesheet of its own for what Bootstrap has no classes for (Timeline so far), in
  Bootstrap's variables: import `@tsazor/bootstrap/tsazor-bootstrap.css` after Bootstrap's (`npm create tsazor` does,
  through `tsazor.setup`). The package now declares CSS as a side effect.
- **Fix** the skins' and `@tsazor/markdown`'s builds overwrite `dist/` in place: a running dev server picks up a rebuild
  (it kept the old one, L7).

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `Chip` and `ChipSet` (MudBlazor's `MudChip`,
  `MudChipSet`; Fluent 2's Tag). A set's `selectionMode` is single (one chip stays selected), toggle, multiple or none,
  two-way with `@bind-selectedValue(s)`; `checkMark`, `allClosable`, `readOnly`, `comparer`, `onClose`. A chip is a
  toggle button (`aria-pressed`) in a set, and alone a label, a button, a link or a toggle (`@bind-selected`); its close
  button sits beside it (not inside: no nested buttons), and Delete or Backspace closes it, the focus moving to the next
  chip. `intent`, `appearance`, `size`, `shape`, `icon`, `avatarContent`. `@tsazor/ui`: `ChipSetModel`,
  `nextChipSelection`.

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (wave A): `Avatar` (Fluent UI Blazor's `FluentAvatar`): `image`,
  else the initials of `name` (Fluent UI's rules: first and last word, no text in brackets, none for a phone number),
  else an icon; `color` neutral, brand, colorful (picked by a hash of the name, or `colorId`) or one of Fluent 2's 30
  named colors; `shape`, `size`, `active` (ring, shadow) and `active="false"` (dimmed), `tooltip`; with `onClick`
  a button. The name is its accessible name. Fluent draws Fluent 2's persona palette (`styles/avatar-colors.css`, written from
  `@fluentui/tokens`), Bootstrap a tint of its nearest hue behind its emphasis color. `@tsazor/ui`: `avatarInitials`,
  `avatarColorFor`, `avatarIconSize`, `AVATAR_COLORS`.

- `@tsazor/markdown` (new; wave A, D-L3): a `Markdown` component (MudBlazor's `MudMarkdown`: `Value`) that renders
  GitHub Flavored Markdown with marked and sanitizes it with DOMPurify, always: scripts, event handlers,
  `javascript:` links, styles and forms are removed, so an agent's or a user's text can be shown as it comes. Links to
  another origin open in a new tab with `rel="noopener noreferrer"`. `breaks`, `inline`, `highlight` (a
  highlighter's HTML, sanitized too), `tableClass`, `allowTags`/`allowAttributes`; `renderMarkdown()` for the HTML
  alone; `markdown.css` in the skin's tokens (Fluent's, else Bootstrap's).

- **Fix** `@tsazor/ui`: `icon()` given a whole `<svg>` keeps its root's fill and stroke attributes (on a `<g>` around
  the content). An outline icon (`fill="none" stroke="currentColor"` on the root) was drawn filled under the skins'
  `fill="currentColor"`; and a root's `stroke-width` was read as its width (L4).
- **Deprecated** both skins' `Icon` `name` and `@tsazor/ui`'s `builtInIcons` (the small stroke set): use `value` with
  a generated set or `icon()`. Nothing in the repo uses them any more (icons step 6, F17 closed).

- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui` (F17, icons step 4 in [design-icons.md](docs/design-icons.md)):
  icons on the components, with Fluent UI Blazor main's names.
  - `Button`, `MenuItem` (Bootstrap: `DropdownItem`), `Badge` and `NavbarLink` take `iconStart`/`iconEnd`; `Tab`
    takes `iconStart`. A Button without a label is icon-only (square in Fluent) and needs an `ariaLabel`; Badge
    takes `iconLabel`.
  - `TreeViewItem` takes `iconStart`, `iconEnd`, `iconCollapsed` and `iconExpanded`; `SidebarNav`'s links take
    `icon` and `iconActive` (the filled icon on the current page). The compact rail shows only the icons, with the
    labels as names and tooltips.
  - `Icon` without `size` draws a value at its own size (`iconSize()`: its viewBox width; `Size20` is 20px), as
    `FluentIcon` does; a `name` stays 16px. Bootstrap's `Icon` sits on the text's baseline, as `.bi` does.
  - Both skins export `icon()` and `IconValue`, so an app's own icons need no other package.
  - The skins draw their own icons from their set (a small copy, `src/core-icons.ts`, as Fluent UI Blazor's
    `CoreIcons`): in Fluent, Alert's status icons, every close button, the pagers, the grid's sort arrows and the
    accordion's and tree's chevrons; in Bootstrap, the grid's sort arrows.
- `@tsazor/fluent`, `@tsazor/bootstrap`, `@tsazor/ui`: `TextInput` and `TextArea` take `immediate` and
  `immediateDelay` (Fluent UI Blazor's `Immediate`/`ImmediateDelay`): the bound value follows the typing once it
  pauses (200 ms), for a search field. The behavior is `ImmediateInput` in `@tsazor/ui`.
- **Fix** `@tsazor/fluent` (`npx @tsazor/fluent add`): a copied component brings the modules it imports
  (`attributes.ts`, `vocabulary.ts`, `core-icons.ts`, imported components), not only the components in its markup;
  a copied Alert didn't compile (L3).
- **Fix** `@tsazor/fluent`: a component's `class` of `null` (`class="@(open ? "x" : null)"`) replaced the
  component's own classes; now it adds nothing (L1).
- `@tsazor/fluent-icons`: each variant and size is also its own entry point (`@tsazor/fluent-icons/regular/size20`),
  for a lighter dev server start; the namespace loads the whole set there (about 1 s).
- `@tsazor/compiler` (codemod): Fluent UI Blazor's `new Icons.Regular.Size20.Save()` becomes
  `Icons.Regular.Size20.Save` in markup.

- **Fix** `@tsazor/compiler` (`tsazor check`, the editor; F15): the narrowing of an `@if` reaches the markup inside
  it, as Razor's nullable analysis carries it. `@if (node) { <Card>@node.name</Card> }` was TS2531 on `node`,
  because child content is a function that runs later. Now child content, slots and templates (`<PageTitle>`,
  a grid's columns) and the setters of `@bind` and `@bind-Value` are checked where they are written. The check
  still reports what a deferred body assigns (it doesn't narrow the code after it), and a lambda you write keeps
  TypeScript's rule (`@onclick="() => greet(node.name)"` needs a local). Real builds are unchanged.

- **Fix** `@tsazor/lsp` (`tsazor check`, the editor), Linux and macOS: the components of a package (`@tsazor/fluent`,
  `@tsazor/bootstrap`) were type-checked against its published declarations, which list the parameters only, so a
  `@ref`'s methods (a DataGrid's `scrollToItem`) were TS2339. The package was looked up through
  `<package>/package.json`, which a package whose `exports` list only `.` refuses; Windows let it through. Found by
  CI's check job (Linux) on the new QuickGrid parity pages.

- `@tsazor/ui`, `@tsazor/fluent`, `@tsazor/bootstrap` (F17, the first step of the icons in
  [design-icons.md](docs/design-icons.md)): an app brings its own icons.
  - `@tsazor/ui`: `IconValue` (an SVG's viewBox and inner markup) and `icon(name, svg)`, which takes the inner
    markup or a whole `<svg>` (Fluent UI Blazor's `new Icon(name, variant, size, content)`). The small built-in
    set moved here (`builtInIcons`).
  - Both skins' `Icon` take `value` (wins over `name`), `color` and `title`, as Fluent UI Blazor's
    `FluentIcon` does. `@tsazor/bootstrap` gets `Icon` (`.bi`, as Bootstrap Icons), with the same parameters.
- `@tsazor/fluent-icons` (new): the Fluent System Icons (20,786: Regular, Filled, Light, Color; sizes 10–48) as
  `IconValue`s, written as Fluent UI Blazor writes them: `@import * as Icons from "@tsazor/fluent-icons"`, then
  `<Icon Value="@Icons.Regular.Size20.Save" />`. One module per variant and size, joined by namespaces: a page ships
  only the icons it uses (a build test checks it), and a misspelled icon is a type error with the near name.
  Generated at build time from `@fluentui/svg-icons` 1.1.344 (MIT, Microsoft); no API snapshot (the set is the API).
- `@tsazor/bootstrap-icons` (new): Bootstrap Icons (2,078) the same way, `Icons.Alarm`; a name that starts with a
  digit gets `Number` in front (`Icons.Number0Circle`). Generated from `bootstrap-icons` 1.13.2 (MIT).

- **Blazor 11 parity** `@tsazor/runtime`: `Virtualize<TItem>` is Blazor 11's
  ([design-virtualize.md](docs/design-virtualize.md)).
  - **Measurement:** the rows are measured, so rows of different heights work; `ItemSize` is only the first
    estimate.
  - **New parameters:** `ChildContent`/`ItemContent`, `Placeholder`, `EmptyContent`, `MaxItemCount`,
    `AnchorMode` (`End` follows new rows at the bottom, for a feed or a chat), `ItemComparer` and
    `InitialItemIndex`. New method: `scrollToItem(index, signal?)`.
  - **Provider requests** carry an `AbortSignal`. The view stays in place when rows are inserted above it.
  - **Behavior changes:**
    - `OverscanCount` defaults to 15 (`Overscan` and `ItemTemplate` stay as aliases).
    - Before the first spacer report, nothing renders.
    - Without an item template, nothing renders for the items.
    - The spacers have no class.
    - Giving both `Items` and `ItemsProvider` is an error.
  - **Fixes of Blazor 11 bugs** (design-virtualize.md §6), among them: a delete above the viewport is compensated,
    End typed into a text field no longer moves the list, an anchored row no longer drifts in Safari (WebKit keeps
    scrollTop in whole pixels), Home pressed soon after End reaches the top, a user scroll cancels a pending
    `scrollToItem`, rows loading in place of placeholders don't move the visible row, `scrollToItem` fills the
    viewport before it completes, and a reader who scrolls up in a live feed (`AnchorMode.End`) is no longer
    pulled back to the bottom by the next row (Firefox, Safari).
  - `@tsazor/testing` renders a Virtualize's rows up to `MaxItemCount` as bUnit does, since a test DOM has no
    layout.
- `@tsazor/compiler`: a generic component's type argument is inferred from whichever parameter the tag sets, and
  from a type argument of a generic type, as Razor infers it: `<DataGrid ItemsProvider="@provider">` with a
  `GridItemsProvider<Person>` field gives `TGridItem` = `Person`, and the columns inside get it. Before, only the
  first parameter that uses the type parameter was tried (`Items`), so such a grid needed `TGridItem="Person"`.
  Where a tag's type arguments can't be inferred, the type errors inside it say so and name the fix, as Razor's
  RZ10001 does (new in the compile result: `uninferredTypeArguments`). Before, a column's lambda showed its row as a
  `RenderTreeBuilder` without a word about the cause.
- `@tsazor/bootstrap`, `@tsazor/fluent`: the virtualized DataGrid passes `AnchorMode`, `ItemComparer` and
  `InitialItemIndex` as QuickGrid 11 does, and has `scrollToItem`.
  - Rows keep their element when the window slides (`@key`).
  - Loading windows show placeholder rows.
  - Rows are no longer forced to `ItemSize`'s height.

- `@tsazor/runtime` (Tsazor extension, E13): an in-app navigation keeps the previous page on screen until the new
  one has rendered and its async work is done, then shows it in one step, as Blazor's enhanced navigation does. The
  async work counted here is lifecycle methods, the Router's `OnNavigateAsync` and a lazy page's chunk. Before, a
  page whose data was still loading showed empty for a few frames. On the FluentCMS port the page then shrank and
  its dark footer flashed mid-screen. The hold uses the browser's view transitions, without animation, and lasts at
  most `routing.holdPreviousPage` ms (default 1000; `false` turns it off). The URL and `LocationChanged`
  change together a frame after the navigation starts, so a handler's error is reported as uncaught instead of propagating out of
  `navigateTo`. A navigation during the hold joins it, and a click on a link of the held page follows the link. A
  Router with `<Navigating>` shows it instead of holding during `OnNavigateAsync`. Data
  a service loads on `LocationChanged` isn't waited for; load it in `OnNavigateAsync`. See
  `docs/design-navigation-hold.md`.

- **Fix (Blazor parity)** `@tsazor/compiler`, `@tsazor/runtime`: a component with `<HeadContent>`, `<PageTitle>` or
  `<SectionContent>` no longer rebuilds that content on each of its renders. `SectionOutlet` keys its content on the
  fragment, as Blazor does. In C# a child content lambda that uses only `this` is an equal delegate on every render,
  but a JS function was a new key each time, so the head's stylesheets were removed and added again and the page
  flickered. The compiler now caches child content that uses no local declared outside it on the component (render
  hint H4), and `PageTitle` and `HeadOutlet` pass one function per instance, as Blazor's method groups are. Child
  content that uses a loop variable or another outer local stays new per render, as in C#. H4 is parity, so
  `renderHints: false` keeps it; only `optimize: false` turns it off. A fragment written by hand in TypeScript is
  stable only when it is one function per instance.

- `@tsazor/compiler`: a `"` inside an expression ends a `"`-quoted attribute value, as in Razor
  (`onClick="() => go(id, "x")"` ends after `go(id, `). That cut produced a cascade of TZS009 "Invalid attribute name"
  errors. Now it is one TZS024 at the quote, saying so, with a quick fix (single quotes around the attribute, or
  `@(…)` when the value holds both quotes), and parsing goes on after the value that was meant.
- `@tsazor/runtime`: `Renderer.waitUntilIdle({ timeout })` rejects when the renderer isn't idle in time, naming the work
  still pending (`Still pending: Search: input handler.`); without `timeout` it waits as before. `track(promise, label)`
  names tracked work. `@tsazor/testing`: `render`, `click`, `change`, `settle` and `rerender` wait 4 s, under vitest's
  5 s test timeout, so a test that waits on a handler it never lets finish fails naming the handler instead of timing
  out without a hint.
- **Fix** `@tsazor/fluent`, `@tsazor/bootstrap`: `Dialog.onClosed` and `Drawer.onClosed` are `EventCallback`, without
  an argument. They were typed `EventCallback<MouseEvent>` but never passed an event: Escape and the backdrop have
  none, and the close button didn't pass its click. A handler that reads the event is now a type error instead of a
  failure at run time.
- **Blazor parity** `@tsazor/runtime`: `RenderTreeBuilder.addComponentParameter` (Blazor 8's AddComponentParameter): a
  parameter of the open component, right after `openComponent` or another parameter; anywhere else it throws Blazor's
  error. Builder code ported from Blazor calls it: FluentCMS renders the component tags of its stored layouts this way.
  The tutorial's new lesson "Markup with components" builds a render tree from HTML that holds a component tag.
- `@tsazor/fluent`: **Autocomplete** (Fluent UI Blazor's FluentAutocomplete, the ARIA combobox pattern with a listbox
  popup), generic over `TOption`. It searches `items` by `optionText`, or raises `onOptionsSearch` (Blazor's
  `OptionsSearchEventArgs`: the handler sets `args.items`; `args.signal` aborts when a newer search starts, and an older
  answer that still arrives is dropped). The arrow keys, Home, End, Enter and Escape work in the input
  (`aria-activedescendant`). With `multiple` (the default) the values are removable chips, bound with
  `@bind-selectedOptions`, and Backspace in the empty input removes the last; without it, `@bind-selectedOption`. Also
  `optionTemplate`, `optionKey`, `maximumSelectedOptions` and `maximumOptionsSearch`. `@tsazor/ui` has the model both
  skins can share: `SearchRunner`, `comboboxKeyAction`, `filterOptions`, `toggleOption`. FluentCMS picks select values
  with it.
- **Blazor parity** `@tsazor/runtime`: `@bind:format` (and `formatValue`/`parseValue`) take .NET's whole date and time
  format grammar in the invariant culture: `ddd`/`dddd`, `MMM`/`MMMM`, `h`/`hh` with `t`/`tt`, `f`…`fffffff`, `F`…, `K`,
  `z`/`zz`/`zzz`, `g`, quoted text, `\` escapes, `%`, and the standard formats (`d`, `D`, `f`, `F`, `g`, `G`, `M`, `o`,
  `R`, `s`, `t`, `T`, `u`, `U`, `Y`). The subset knew `yyyy MM dd HH mm ss` and read every other letter as text, so
  `dddd, dd MMMM yyyy` came out as `dddd, 05 0101 2024`. **Behavior change:** a letter that is a specifier in .NET
  (`g`, `h`, `t`, …) now formats; quote literal text as in .NET.
- **Blazor parity** `@tsazor/runtime`: `InputDate` takes `type` (Blazor's InputDateType: `date`, `datetime-local`,
  `month`, `time`). `@tsazor/fluent`, `@tsazor/bootstrap`: `DateInput` takes the same `type`.
- **Fix** `@tsazor/runtime`: `InputDate` writes and reads a `Date` in local time, as .NET's DateTime has no zone. It
  wrote it through `toISOString()`, so a local midnight east of Greenwich showed the day before, and read a date as
  UTC midnight. A bound string now stays a string (it became a `Date`).
- **Fix** `@tsazor/runtime`: `InputNumber` shows a `null` value as an empty input; it showed `null`.
- **Blazor parity** `@tsazor/workspace` (tags in every tool): every directory above a component, up to the project root,
  is an enclosing namespace, as in C#. A component in `Admin/` is in scope in `Admin/Fields/` without `@using`; only
  the directories with an `_Imports.tsazor` were. `ImportsChain` records its `root`.
- `@tsazor/fluent`: `Dialog` takes `size` (`small`, `medium`, `large`, `xlarge`), as Bootstrap's does. Its width was
  fixed at 560px; FluentCMS edits a field's settings in a large dialog.
- `@tsazor/runtime`: in development, a by-type cascading parameter (`@CascadingParameter({ type: X })`) that finds no `X`
  but passes a cascade whose value is a plain object warns once. By type matches instances, and API data (parsed JSON)
  is never an instance of its generated model class, so such a parameter stayed unset without a word; the warning says
  to cascade it by name. The tutorial's named-cascades lesson says so too.
- `@tsazor/compiler`, `@tsazor/lsp`: TS2304 for a name in `@code` that markup finds by name (a component through
  `@using` or its folder, a type in a `.ts` file there) names the exact `@import`, and the language server inserts it
  after the directives as a quick fix (`@import type` when only types use the name). `tsazor check` shows the hint. In
  TypeScript code a type comes from an import; a Blazor `@ref` field (`private FilesTable? table`) meets this first.
- **Blazor parity** `@tsazor/runtime`: an unset optional callback can be forwarded (`onCancel="@onCancel"`).
  `EventCallback.bind` passes `undefined` through, so the child sees no callback, and an element gets no handler, as
  Blazor skips the attribute of an EventCallback without a delegate. It didn't type-check (`EventCallback | undefined`).
- **Fix (Blazor parity)** `@tsazor/runtime`: `InputFile` returns the task of `onChange`, as Blazor does. An async upload
  in the handler was not awaited, and its error missed the ErrorBoundary.
- `@tsazor/compiler`: `@ref` takes `this.name` as well as `name`, as markup writes members elsewhere. It was TZS008.
- `@tsazor/fluent`, `@tsazor/bootstrap`: `BreadcrumbItem` takes `onClick` and is then a button: for a trail kept in
  state, not in the URL (FluentCMS's folder picker). **Fix** `@tsazor/bootstrap`: the active item has
  `aria-current="page"`.
- `@tsazor/fluent`: the icons `folder`, `folder-up`, `document`, `image` and `download`.
- `@tsazor/dotnet`: **file uploads** (`multipart/form-data`). An operation with a multipart body, such as an ASP.NET Core
  action that takes `IFormFile` or `IEnumerable<IFormFile>`, gets a body type of its own (`FileUploadForm = { files?: Blob[] }`)
  and sends a `FormData`. A schema string with `format: binary` is a `Blob`, which a `File` from an input is. The new
  `formData(fields)` builds the body: one part per array item and file name, null left out. The generator used to send
  the files as JSON. FluentCMS uploads its files this way.
- **Fix** `@tsazor/bootstrap`, `@tsazor/fluent`: the published declarations type-check without `skipLibCheck`:
  - a component that names another component's type (MenuItem's `Menu`, Tab's `Tabs`) imported it as
    `import type { default } from "../src/Menu.tsazor"`, which is invalid TypeScript and points into source the
    package doesn't ship; with `skipLibCheck` the type silently became `any`. It is `import type Menu from "./Menu.js"` now
    (`@tsazor/workspace`'s `componentTypeDeclaration`);
  - `index.d.ts` had empty statements (`;;`);
  - `@tsazor/fluent` exported two things as `Toast`, the component and `@tsazor/ui`'s toast type; it exports the
    component, and the type comes from `@tsazor/ui`.

  A test per skin checks every declaration as a consumer sees it.
- `@tsazor/fluent`: **TreeView** (Fluent UI Blazor's FluentTreeView): `items` in nested levels, `@bind-selectedItem`. It
  follows the ARIA tree pattern: one node takes Tab, the arrow keys move and open or close, Home and End jump, Enter and
  Space select; the selection's ancestors start open. `@tsazor/ui` has the model both skins can share: `TreeViewItem`
  and the keyboard as pure functions (`treeKeyAction`, `visibleTreeItems`, `treePath`, `initiallyExpanded`). FluentCMS
  picks a page's parent with it.
- `@tsazor/compiler`: a value named like a directive in markup text (`@foreach (const layout of layouts) { @layout.name }`)
  is still read as the directive, as Razor does, but TZS013 now says so and offers `@(layout.name)` as a quick fix, and
  parsing goes on. It swallowed the rest of the line, and the unclosed elements after it buried the cause under
  dozens of follow-up errors (62 in FluentCMS's site form). A bare `Page @page of 7` gets the fix `@(page)`.
- `@tsazor/fluent`: **CheckboxGroup**, several values out of `options` in a fieldset, bound as `string[]`. Its options
  are RadioGroup's (`value`, `label`, `disabled`); the bound array follows their order, and values it doesn't show
  stay in it. FluentCMS assigns a user's roles with it.
- **Blazor parity (Blazor 8)** `@tsazor/runtime`: `@SupplyParameterFromQuery()` works in any component, not only in a
  page, and needs no `@Parameter()` (still allowed alongside). The renderer supplies the value like a cascading value
  and again when a navigation changes it. FluentCMS reads `?id=` this way in components that aren't pages (its
  plugins). It was RouteView's job and threw without `@Parameter()`.
- **Blazor parity** `@tsazor/runtime`: an input's `Value` may be null (Blazor's `TValue? Value`). A `string | null`
  field (every string Swashbuckle generates without nullable reference types) binds to a text input, which hands
  back a string; a `string` field stays strict.
- `@tsazor/compiler`: the component's own class name stays free in markup, so `RoleList.types` reaches a static,
  as in Razor. It was rewritten to `this.RoleList`.
- `@tsazor/bootstrap`, `@tsazor/fluent`: `Button` takes `href` and is then a link that looks like the button (Fluent UI Blazor's
  `FluentAnchor`, Bootstrap's `<a class="btn">`): it navigates, opens in a new tab, and is announced as a link. A disabled
  one has no `href`. FluentCMS's buttons for "Add Role", "Edit" and "Cancel" are links.
- `@tsazor/compiler` **TZS032**: a `@code` member under one of Blazor's lifecycle names (`onInitializedAsync`,
  `OnParametersSet`, `OnAfterRenderAsync`, `Dispose`, …) is an error, with a quick fix that renames it to
  Tsazor's hook. Tsazor has one hook for each step, and the hook may be async; without `override`, a member
  called `onInitializedAsync` compiled without a word and never ran. Found while porting FluentCMS.
- **Fix** `@tsazor/bootstrap`, `@tsazor/fluent`: components await the callbacks they invoke, as Blazor's
  `await OnClick.InvokeAsync(e)` does. Button, Form, Dialog, Drawer, Tabs, Menu/Dropdown items, list
  items, Pagination, Alert and Toast dropped the promise. Two consequences are fixed:
  - an error in an async `onClick` or `onValidSubmit` reaches the ErrorBoundary, instead of being an
    unhandled rejection;
  - `render().click()` in tests waits for an async handler behind a library button.
- **Blazor parity** `@tsazor/runtime`: `ComponentBase.dispatchExceptionAsync(error)` (Blazor's
  `DispatchExceptionAsync`). It hands an error from outside the renderer to the nearest ErrorBoundary, for
  example an error from a callback of a DOM listener, a timer or a behavior. The skins use it for Escape and
  backdrop dismissal.
- **Blazor parity** `@tsazor/runtime`: the route constraint `nonfile`. `@page "/{**route:nonfile}"` takes every
  path that doesn't end in a file name, which is FluentCMS's page for all CMS URLs. On a catch-all it checks
  the whole remainder, as ASP.NET Core does.
- **Fix** `@tsazor/dotnet`, found by porting FluentCMS against its real OpenAPI document:
  - **Without `operationId`** (Swashbuckle's default), method names come from the path:
    `POST /api/User/Create` → `userCreate`. They were `postapiUserCreate`, and a path parameter made the
    output invalid TypeScript (`deleteapiUserDeleteId}`). Names that collide get the HTTP method, then
    the path parameters (`getOrdersById`). One warning replaces one warning per operation.
  - **`--envelope`:** the generated return type is the envelope's `data`. It was the envelope itself,
    while the client returned `data` as the body.
  - **Envelope errors on an error status** (FluentCMS answers 500 with them) are the result's message.
    It was `HTTP 500`.
  - An envelope error object `{ code, description }` reads as its description, or as its code when that
    is empty. It was `code: …` plus `description: …`.
  - **Value types in responses are present.** In a schema that appears only in responses, a property
    that can't be null is no longer optional: `Guid Id` reads as `id: string`, not `id?: string`.
    Swashbuckle lists no `required` by default, but ASP.NET Core writes every property. Blazing Pizza's
    generated `Marker.showPopup` changes accordingly.
  - A schema without a type (C#'s `object?`) maps to `unknown` without a warning.
- **Fix (Blazor parity)** `@tsazor/runtime` `NavLink`: every other attribute goes onto the anchor, as
  Blazor's `AdditionalAttributes` does.
  - `<NavLink class="nav-link" href="counter">` renders `class="nav-link active"` while the link is
    active.
  - `title`, `target` and `aria-*` pass through as well. Without this, the Blazor template's nav menu
    didn't compile (TZS025).
  - `cssClass` still works, but is deprecated in favor of `class`.
  - A link with neither a class nor the active state now renders no `class` attribute (it was
    `class=""`).
- **Fix** `@tsazor/bootstrap`, `@tsazor/fluent`: `sideEffects` in `package.json`. An app that uses a few
  components no longer bundles the whole library. The starter's app with Bootstrap went from 66.7 KB gz
  to 30.7 KB gz.
- New package `create-tsazor` (R3, [design-create-tsazor.md](docs/design-create-tsazor.md)):
  - `npm create tsazor@latest my-app` writes an app in the shape of `dotnet new blazorwasm`: MainLayout
    and NavMenu, Home, Counter, Weather, a Counter test, and strict TypeScript.
  - `--ui <package>` sets up any component library from its `tsazor.setup`.
  - `--dotnet` adds `@tsazor/dotnet`.
  - The tarball smoke now builds and tests the app the packed starter writes.
- `@tsazor/bootstrap` `addBootstrap` and `@tsazor/fluent` `addFluent`: they register the services the
  components use (the `Toaster`) in one call, `createTsazorApp({ services: addBootstrap })`. This is
  Blazor's `AddMudServices()`.
- **The setup contract for component libraries** ([component-libraries.md](docs/component-libraries.md)):
  - A library's `package.json` declares `tsazor.setup`: its stylesheets, its services function and the
    components its layout needs once.
  - The keyword `tsazor-components` makes it findable.
  - `npm create tsazor --ui <package>` reads the contract for any library.
  - Both skins declare it. `@tsazor/bootstrap` has `bootstrap` (its CSS) as a peer dependency.
- Tutorial: chapter *Component library* (Part 3, chapter 06; Testing, Localization and Next steps move one
  on): a skin and its vocabulary, forms with the library, a DataGrid, toasts and a dialog. The preview adds
  Bootstrap's stylesheet for lessons that use `@tsazor/bootstrap`; the in-browser type check knows `@tsazor/ui`.
  The type-argument inference (`inferTypeArgument`, new in `@tsazor/compiler`) is one function for the language
  server and the tutorial — the tutorial's copy lacked the lambda return type, so a DataGrid column's
  `Format="(v) => …"` typed `v` wrongly there. **Fix** `@tsazor/bootstrap`: `class` on a component replaced its
  Bootstrap classes (`<Button class="delete">` lost `btn`); it adds to them now, as in the Fluent skin.
- New app `apps/skins`: one set of pages built with both skins (`@using @tsazor/bootstrap`; the fluent build
  aliases the package and loads `fluent.css`), with a link to the same page in the other build; its gate
  runs the same 30 checks (axe on every page, the behaviors by role and label) on both, in CI too. Found
  and fixed on the way: `NavbarLink` (new, both skins) — plain links in Bootstrap's navbar had 4.26:1;
  **Fix** Bootstrap `AccordionItem` rendered `aria-expanded=""` (a boolean attribute) instead of "true"/"false";
  Bootstrap `Pagination` buttons get `type="button"` (they submitted an enclosing form), the labels "Previous
  page"/"Next page"/"Go to page n" and `aria-current` on the current page.
- The skins' shared parameters line up (found by comparing their manifests): `@tsazor/fluent` gets `help` on
  TextInput, TextArea, NumberInput, Select, Checkbox and Switch, the search/tel/url TextInput types, `Form`
  (alias of FluentForm), `CardBody` and `CardTitle`, and a Spinner `label`; `@tsazor/bootstrap` gets `ariaLabel` on
  Button, the inputs and Navbar, and its Spinner `label`, `ariaLabel` and `size="large"` (**Changed**: `text` ⇒ `label`).
  **Fix** (Bootstrap Spinner): the `role="status"` element was `aria-hidden` and its text outside it — screen
  readers announced nothing; now the status region carries the name. What still differs is skin-specific
  on purpose (Fluent `shape`, Bootstrap `pill`, …) — and `Table`, whose two APIs remain different.
- The rest of Tier 1 in both skins, with the same parameters: `ButtonGroup`, `DateInput` (the value is the ISO date
  text `"2026-10-07"` — no time zone to shift the day), `FileInput` (around the runtime's `InputFile`), `FormField`
  (label, help and the field's validation message around a control of your own), `Skeleton`, `Popover` (a
  non-modal dialog by its button); `@tsazor/fluent` adds `Navbar`, `@tsazor/bootstrap` `Grid` and `Typography`. Gallery
  page `/more`; the demo's components page shows them. The a11y gates wait for each page's heading before axe:
  a page that failed to load is empty, and axe found nothing wrong with it.
- Tier 1 parity of the two skins: `@tsazor/fluent` adds `RadioGroup`, `Accordion`/`AccordionItem` (panels as regions
  labelled by their header), `Collapse`, `Progress` and `ListGroup`/`ListGroupItem`; `@tsazor/bootstrap` adds `Switch`,
  `Stack` and `Divider` — each with the parameters of its counterpart in the other skin. Gallery page `/structure`;
  the demo's components page shows Switch, Stack and Divider.
- `@tsazor/fluent`: `Menu`/`MenuItem` (the menu button pattern on `@tsazor/ui`, also exported as `Dropdown`/`DropdownItem`),
  `Drawer`, `Tooltip` and the `tooltip` attachment; `@tsazor/bootstrap` exports `Menu`/`MenuItem` as aliases of
  `Dropdown`/`DropdownItem`, so both names work in both skins. Gallery page `/overlays`. **Fix** (type layer):
  a package export whose name differs from a component file only in case (`tooltip` next to `Tooltip.tsazor`)
  was bound to the component's shadow on case-insensitive file systems.
- **Changed** `@tsazor/fluent` `DataGrid` takes the QuickGrid shape of `@tsazor/bootstrap`'s (pre-1.0 API break: the
  `columns` array, `cellContent`, `compact` and `emptyText` give way to `PropertyColumn`/`TemplateColumn`, `small`
  and `EmptyContent`), with sorting, paging (`Paginator`, new), selection, an ItemsProvider and virtualization;
  `GridSort`/`PaginationState` re-exported. **Fix** (Fluent tokens, light theme): `--fui-color-amber-1` is
  #9C4D04 — #B75C06 had 4.19:1 on the amber glass (subtle warning badges), below WCAG's 4.5:1.
- **Changed** `@tsazor/fluent` adopts the shared vocabulary of `@tsazor/ui` (pre-1.0 API break): `Button`
  `intent` + `appearance` (solid/outline/subtle/transparent; `appearance="primary"` ⇒ `intent="primary"`),
  `Badge` `intent` (`color` ⇒ `intent`, `error` ⇒ `danger`, `brand` ⇒ `primary`; `filled` ⇒ `solid`), `Alert`/`Toast`/
  `Indicator` `intent` (`variant`/`severity`/`color`), `Pagination` `pageCount` + `onPageChanged`. `ToastProvider`
  is replaced by `ToastRegion` on the shared `Toaster` service (re-exported, with the vocabulary types).
  Dialog, Tabs, ids and the submit-attempt state run on the `@tsazor/ui` behaviors: nested dialogs
  close one at a time; tabs always link to their panels.
- **Changed** `@tsazor/runtime` `Virtualize`: like Blazor's, it renders no wrapper element — the spacers and
  items go into the parent; `SpacerElement` (default `div`) sets the spacers' tag; the captured extra
  attributes (which went onto the wrapper) are gone: style the scrolling container around it. A
  superseded `ItemsProvider` result (or failure) is dropped. DataGrid: `Virtualize` (with `ItemSize`,
  `OverscanCount`) renders only the rows in view, with `aria-rowcount`/`aria-rowindex`, from Items or an
  ItemsProvider; it doesn't combine with pagination. `DataGridModel.sortedItems`, `provideRange`,
  `setVirtualization`.
- Tutorial: a **Playground** (`/playground`, linked in the site bar): a free project with the lesson
  workbench — editor, problems, type check, preview — where files can be added, renamed and deleted;
  "Playground" on a lesson continues there with the lesson's files. Nothing is saved yet (the files
  live until the page reloads).
- DataGrid (QuickGrid-shaped). `@tsazor/ui`: `DataGridModel` (columns collected on every render, sort,
  rows of the page, `ItemsProvider` requests with an AbortSignal), `GridSort` (`byAscending(…).thenDescending(…)`),
  `PaginationState`, `toggleSelection`/`toggleAll`, `propertyTitle`/`propertyPath`. `@tsazor/bootstrap`: `DataGrid`
  (Items or ItemsProvider, sortable headers with `aria-sort`, row selection bound to `selectedItems`, empty
  and loading content, striped/hover/bordered/small/responsive/sticky header), `PropertyColumn`,
  `TemplateColumn` and `Paginator`; the columns take the row type from the grid (cascading type
  parameter). **Fix** (type layer): the "read as a TypeScript expression, not as text" note no longer
  lands on values that are plainly code (a lambda, a call, a member access).
- Cascading type parameters (Blazor's `[CascadingTypeParameter]`): `@attribute
  @CascadingTypeParameter("TGridItem")` on a generic component passes its type argument to the
  same-named type parameters of the components inside its content, so a column's
  `Property="(o) => o.customer"` is typed by its grid. `@tsazor/runtime`: the `CascadingTypeParameter`
  decorator (compile-time only); `@tsazor/compiler`: `ComponentMetadata.cascadingTypeParameters`, the
  Blazor form is TZS021 with the rewrite as its fix. The type layer infers a type parameter from a
  lambda's return type (`Property: (item: TGridItem) => TProp`). **Fix** (typed shadows): an optional
  function-typed parameter was checked against `(…) => T | undefined` instead of `((…) => T) | undefined`.
- `@tsazor/ui`: `Toaster` (the app's toasts as a DI service: `show({ title, message, intent, timeout })`,
  `dismiss`, `pause`/`resume` for WCAG 2.2.1, `subscribe`) and the `tooltip(text, options)` attachment
  (hover and focus, hoverable, Escape, `aria-describedby`, WCAG 1.4.13; the same text gives the same
  attachment). `@tsazor/bootstrap`: `ToastRegion`, `Drawer` (offcanvas, a modal panel) and `Tooltip`,
  plus the `tooltip` attachment and `Toaster` re-exported. `@tsazor/testing`: `renderTree` takes
  `{ services }`.
- Browser support documented (docs/browser-support.md): the current Chrome/Edge, Firefox and Safari. CI
  runs the browser gates (tutorial, Pages, Pizza, gallery, demo) in Firefox and WebKit too. **Fix**
  (tutorial preview): errors in the console panel lost their message in Firefox and Safari, whose
  `error.stack` has no "Name: message" head.
- **Fix** `@tsazor/runtime` `Virtualize`: the visible window is measured against the nearest scrolling
  ancestor (or the window), as in Blazor — a list without a height of its own inside a scrolling panel
  rendered every item (the demo: 30,033 DOM nodes for 10,000 items, now 105). Found by running the
  gates in WebKit.
- **Fix** `@tsazor/ui` `focusTrap`: focus returns to the opener also when a click didn't focus it
  (Safari doesn't focus buttons on click): the trap remembers the last pressed focusable element.
- Gate scripts: `TSAZOR_BROWSER=edge|firefox|webkit` (`scripts/browsers.mjs`); the a11y gates' wait for
  animations is capped at 3 s.
- `@tsazor/worker`: `WORKER_SCOPE` — the host hook through which a worker module loaded in-process (a
  test runner, the tutorial's lesson gate) gets its scope. Tutorial: chapter *Heavy work* (two
  lessons); the preview runs lesson workers as classic workers (a sandboxed frame can't start module
  workers).
- New package `@tsazor/worker` (docs/design-worker.md): heavy work off the main thread.
  `exposeWorker(api)` in the worker module; `class X extends defineWorker<Api>(() => new Worker(…)) {}` on
  the main thread — the class is the DI token (`services.registerType(X, { singleton: true })`,
  `@inject X x`) and a typed proxy whose methods return promises. Callbacks (also inside an options
  object) are called back on the main thread; an `AbortSignal` cancels (the call rejects at once with
  an AbortError); `transfer(value, [buffer])` moves buffers; errors keep their name and message; the
  worker starts on the first call; `{ pool: n | "auto" }` spreads calls; `terminate()`/`dispose()`;
  `inProcessWorker(api)` is the test double over a real MessageChannel. Under Trusted Types it
  installs a same-origin-only `default` policy (CSP: `trusted-types tsazor default`, docs/csp.md).
  Zero dependencies. The demo's /worker page and `verify:worker` check it in Edge, also under the
  strict CSP.
- `@tsazor/ui`: the form core — `FieldState` (input, help and message ids; validity from InputBase's
  field classes; the message only after a submit attempt; `aria-invalid`/`aria-describedby`) and
  `markSubmitAttempt`/`hasSubmitAttempt`. `@tsazor/bootstrap`: `Form` (EditForm that records submit
  attempts), `TextInput`, `TextArea`, `NumberInput`, `Select`, `Checkbox` (also as a `switch`) and
  `RadioGroup` (fieldset/legend), all on InputBase (`@bind-Value`) with label, help text and Bootstrap's
  validation styles. The demo gate checks the form in Edge (messages linked to their inputs, axe
  with errors showing).
- `@tsazor/bootstrap`: the shared vocabulary (design-component-library.md §3). **`variant` → `intent`**
  (`Intent`: primary, secondary, success, danger, warning, info, neutral) on Button, Alert (default now
  `info`), Badge, Spinner, Progress, Dropdown; **`outline` → `appearance`** (`solid`, `outline`, `subtle`,
  `transparent`) on Button and Dropdown; **`size` → `"small" | "medium" | "large"`** on Button, Dropdown,
  Pagination, Spinner (was `"sm"`/`"lg"`); Spinner `kind` typed; Navbar **`variant` → `theme`** (`light`/`dark`,
  Bootstrap 5.3 color modes); Pagination gets `ariaLabel`; Button, Alert, Badge take `additionalAttributes`.
  The skin re-exports the vocabulary types (`@import type { Intent } from "@tsazor/bootstrap"`).
- `@tsazor/workspace`: component metadata follows type aliases into packages' declaration files
  (`MetadataCache.resolveDeclarationFile`), so a parameter typed with a package's string-literal alias
  (`Intent` from `@tsazor/ui`) is a string parameter instead of an uncertain one (TZS026).
- `@tsazor/bootstrap`: `Dialog`, `Dropdown` and `Tabs` follow the WAI-ARIA patterns, built on `@tsazor/ui`
  (new dependency). **`Modal` is now `Dialog`** (`Modal` stays as an alias, D-C3); it traps focus and
  restores it, locks the page scroll, closes on Escape (new `closeOnEscape`), has `role="dialog"`,
  `aria-modal`, `aria-labelledby` (new `ariaLabel` without a title) and `additionalAttributes`; **`size`
  is now `"small" | "medium" | "large" | "xlarge"`** (was `"" | "sm" | "lg" | "xl"`). `Dropdown`: menu
  button pattern (arrow keys open and move, typeahead, Escape returns focus, Tab and outside clicks
  close), positioned by `anchoredPosition` (new `placement`); `DropdownItem` gets `role="menuitem"` and
  `disabled`. `Tabs`: roving tabindex, arrow keys, tab–panel ids, new `ariaLabel` and `onSelected`;
  `Tab` renders `role="tabpanel"`. `@tsazor/ui`: `createLayer()` and the `layer` option of `focusTrap`
  and `dismissable` (one overlay's behaviors share a layer); `anchoredPosition`'s `placement` may be a
  function.
- **Renamed:** `@tsazor/components` is now `@tsazor/bootstrap` (the Bootstrap 5 skin of the component
  library, D-C2 in docs/design-component-library.md). Write `@using @tsazor/bootstrap`; the API is
  unchanged so far. The tutorial reference lists it under `reference/components/bootstrap`.
- New package `@tsazor/ui` (component library core, docs/design-component-library.md): unstyled behaviors
  as attachments — `focusTrap`, `dismissable` (Escape, outside press; only the topmost layer reacts),
  `scrollLock`, `rovingFocus` (arrows, Home/End, typeahead), `anchoredPosition` (fixed positioning with
  flip and shift, no dependencies) — plus `uniqueId`, focus helpers, the layer stack and the shared
  vocabulary types `Intent`, `Appearance`, `Size`, `Placement`, `Orientation`.
- `@tsazor/compiler`, `@tsazor/lsp`: S4. New `explainTypeScriptError(code, message)` appends a plain-language
  `Hint:` to the common TypeScript errors (implicit any, possibly null/undefined, unknown names and
  members, types that don't fit); the language server, `tsazor check` and the tutorial use it, so
  their TS messages now end with the hint. The language server offers TypeScript's "Infer
  parameter types from usage" quick fix for implicit-any errors in `@code`.
- `@tsazor/lsp`, `@tsazor/cli`, `@tsazor/vite-plugin`: `tsazor check` warns `TSZSTRICT` (once per tsconfig) when the
  tsconfig of checked files leaves `strict` off or switches one of its flags off again — strict
  TypeScript is the only supported configuration (S2). A warning: exit code and builds are unaffected.
- `@tsazor/runtime`, `@tsazor/compiler`: `@State()` (Tsazor extension; F6, docs/design-state.md).
  `@State() accessor x = …` makes an assignment to `x` schedule a render of its component, like
  `stateHasChanged()` (coalesced, `shouldRender()` consulted, equal values ignored, quiet before
  the first render and during `buildRenderTree`). Shallow: only assignments count. New runtime
  API: the decorator `State`. The compiler imports it itself (like `Bindable`) and reports TZS030
  for `@State()` on a non-accessor (fix: insert `accessor`) or together with
  `@Parameter()`/`@Bindable()`; TZS030's title now reads "@Bindable()/@State() needs an
  auto-accessor of its own.". Tutorial: lesson *Fields that render*.
- `@tsazor/compiler`, `@tsazor/runtime`, `@tsazor/lsp`: transitions and animations (Tsazor
  extensions, Svelte's; F4/F5 in docs/design-svelte-features.md). `@transition`, `@in` and
  `@out` (with the valueless `:global` modifier) play a `Transition<E>` when an element enters
  or leaves; a leaving element stays in the DOM until its outro ends (the applier's indexing
  skips it). `@animate` on a keyed loop row plays an `Animate<E>` (FLIP) when the row moves.
  New runtime API: the types `Transition`, `TransitionConfig`, `TransitionOptions`, `Animate`,
  `TransitionSettings`, the functions `addTransition`, `addAnimate` (what the compiler emits;
  they install the motion support, so apps without them don't bundle it) and
  `configureTransitions` (reduced motion is respected by default). New entry points:
  `@tsazor/runtime/transition` (`fade`, `blur`, `fly`, `slide`, `scale`, `draw`, `crossfade`),
  `@tsazor/runtime/animate` (`flip`), `@tsazor/runtime/easing` (Svelte's easing set). Compiler
  AST: attribute kinds `motion` and `motionGlobal`, type `MotionDirective`. Diagnostics TZS008
  (duplicates, `@transition` with `@in`/`@out`, a misplaced or valued `:global`, `@animate`
  outside a keyed loop row, motion on a component tag) and TZS009 (no value). LSP: completions
  and hover. Tutorial: chapters *Transitions* (9 lessons) and *Animations*.
- `@tsazor/compiler`, `@tsazor/runtime`, `@tsazor/lsp`: `@attach` (Tsazor extension, Svelte 5's
  attachments; F2 in docs/design-svelte-features.md). `@attach="fn"` and any number of
  `@attach:<name>="fn"` on an element run `fn(element)` once the element is in the DOM (at the
  batch end, before `onAfterRender`); a returned function is the cleanup, called when the element
  is removed, the component disposed or the value changes (compared by identity; `null`,
  `undefined`, `false` attach nothing; a member method is bound like a delegate). New runtime
  API: the type `Attachment<E extends Element = Element>`, `addAttachment(builder, sequence,
  name, value)` (what the compiler emits; it installs the attachment support, so apps without
  `@attach` don't bundle it) and `FrameType.Attachment`. Exceptions go to the nearest
  `ErrorBoundary` (phase `afterRender`). Typed shadows check the value as
  `Attachment<HTMLInputElement>` etc. by tag. Diagnostics: no value TZS009; a duplicate name,
  `@attach:` without a name and `@attach` on a component tag TZS008. Rows with `@attach` are
  never reused (H2) or static blocks (F1a). LSP: completions and hover. Tutorial: chapter
  *Attachments*.
- `@tsazor/runtime`: `<Await>` (Tsazor extension, Svelte's `{#await}`; F3 in
  docs/design-svelte-features.md) — the built-in templated component `Await<TValue>` with `For`
  (a promise; a plain value counts as resolved, `null`/`undefined` as pending) and the
  `<Pending>`, `<Then Context="…">` and `<Catch Context="…">` fragments. A new promise starts
  over, a stale one is ignored, nothing renders after dispose; a rejection without `Catch` fails
  the component (nearest `ErrorBoundary`). `@tsazor/lsp` (and the tutorial's checker) infer
  `TValue` through the awaited type of `For`, so the `Then` context is typed; slot completions
  are offered in PascalCase (`<Then>`, `<ErrorContent>`).
- `@tsazor/compiler`, `@tsazor/runtime`: skipping unchanged keyed rows (render hints H2,
  docs/design-render-hints.md). A `@foreach` row that is one element with `@key` evaluates its
  dynamic values first and calls the new `RenderTreeBuilder.reuseKeyed(site, key, values)`
  (`@internal`, with `setReuseSource`): when the values equal the previous render's for that key,
  the previous frames are reused and the diff skips the row. Rows with control flow, code blocks,
  `@ref`, `@attributes`, `@bind`, event modifiers, inner keys, expressions with effects or child
  components getting anything but primitive values are built as before. Part of `renderHints`
  (off with `renderHints: false` or `optimize: false`; never in typed shadows). Selecting a row
  among 11k (A/B on one machine): ~13.5 → ~8–10 ms.
- `@tsazor/compiler`, `@tsazor/runtime`: stable event handlers (render hints H1,
  docs/design-render-hints.md). An event-handler lambda that captures only constant render-time
  locals (`const`, `@foreach (const …)` variables, an unassigned template `context`) compiles to a
  method of the component plus `EventCallback.bindWith(this, factory, [captured])` (`@internal`
  compiler API), equal across renders while the captured values are the same — re-rendering
  unchanged rows swaps no handler. New options `renderHints` (default true) and the umbrella
  `optimize` (default true; `false` turns `staticMarkup` and `renderHints` off) on the compiler's
  `CodegenOptions`/`CompileOptions`, the Vite plugin and `TransformTsazorOptions`. Selecting a row
  among 11k (A/B on one machine): ~25–30 → ~13–14 ms. Parameter change detection keeps Blazor's
  rule (`EventCallback.equalsAsParameter`, `@internal`): a handler that captures locals counts as
  changed, as a C# closure does, so child components re-render with their parent exactly as before.
- `@tsazor/runtime`: replacing an event handler no longer checks the DOM for a leftover inline
  handler string (`hasAttribute`) — it cannot exist once the element had a handler. Selecting a row
  among 11k: 19 → 16 ms.
- `@tsazor/runtime`: features an app does not use stay out of its bundle — the document head
  (`HeadOutlet` and the sections it needs) is mounted once `PageTitle` or `HeadContent` is part of the
  app, `CultureService`/`StringLocalizer` are service defaults their own modules register (still
  resolvable without registration; `createTsazorApp({ localization })` unchanged), and the renderer's
  error-boundary check no longer imports the `ErrorBoundary` components. The bench app: 29.4 → 25.4 KB gz.
- `@tsazor/runtime`: `Router` gets Blazor's `OnNavigateAsync` (`NavigationContext { path, signal }`) and
  `<Navigating>`. Lazy routes (E5): `LazyRouteEntry { template, load, authorize }` in the manifest
  (`RouteManifestEntry`), loaded once on the first navigation; `RouteTable.match`/`matchRoute` return
  a `RouteMatch` (eager or lazy entry); a failed chunk reloads the target once.
- `@tsazor/vite-plugin`: `lazyRoutes: true | string[]` — the matched pages load lazily, each as its
  own chunk, its layout with it.
- `@tsazor/runtime`: `CultureService.setDefault` applies while the culture is still the previous
  default (it compared against the new default and never applied). Every public export and member
  of runtime, testing, dotnet and vite-plugin is documented (the reference's API pages).
- `@tsazor/compiler`: `DIAGNOSTIC_CATALOG` (every code: severity, when it is reported, an example,
  the fix) and `DIAGNOSTIC_MESSAGES` are exported — the source of the reference's diagnostics page;
  `RETIRED_DIAGNOSTIC_CODES` (`TZS007`, `TZS010`). `TZS001` reads "Invalid or misplaced directive."
  (it was "Unknown directive.", which never matched what it reports).
- `@tsazor/runtime`: scrolling on navigation as in Blazor — after an internal navigation the
  `Router` scrolls to the fragment's element (`orders#total`, by id, else by name) or to the top;
  a link that only changes the fragment of the current page adds a history entry and scrolls,
  without `LocationChanging`/`LocationChanged`.
- Component manifests (`tsazor-components.json`, `@tsazor/compiler` `ComponentMetadata`): a
  component `doc` (the class JSDoc, or a leading `@** … *@` in a `.tsazor` file — the markup
  counterpart of `/** */`) and the parameter `default` as written. Every component of
  `@tsazor/components` and `@tsazor/fluent` is documented.
- API snapshots of every published package (`api/`), checked in CI (S1).
- `@tsazor/testing`: `render(Component, { parameters, services })` with typed parameters;
  `find`, `findAll`, `click`, `change`, `setParameters`, `settle`, `markup`; a component's
  failure rejects the call that waited for it.
- `@tsazor/runtime`: `TsazorHttp` takes a `fetch` option; `AuthorizeRouteView` derives from
  `RouteView`; `AuthorizeView`'s `ChildContent` receives the authentication state; hash mode
  works over a `MemoryHistory`.
- `@tsazor/compiler`: `TZS031` (names reserved by `ComponentBase`); unknown names in text read
  as an expression get an explanation (`explainExpressionValue`).
- `@tsazor/runtime`: `createTsazorApp({ strictCsp: true })` writes style attributes through the
  CSSOM, for a CSP without `'unsafe-inline'`; `MarkupString` goes through a Trusted Types policy
  named `tsazor` (see docs/csp.md).
- F1a static markup blocks: `@tsazor/compiler` emits a static subtree as one `addMarkupContent`
  frame (option `staticMarkup`, default on; the Vite plugin passes `staticMarkup: false` through as
  an escape hatch); `@tsazor/runtime` parses each markup string once, clones it per insertion and
  inserts single-node blocks without boundary comments.
- Accessibility (E9): `@tsazor/fluent` dark-theme fills meet 4.5:1 (`--fui-brand-background*`,
  `--fui-color-*-filled`), the light subtle brand badge too, and the dialog's Shift+Tab focus trap
  is fixed; `@tsazor/components`: `Progress` gets `ariaLabel` (its name), `Badge` uses Bootstrap's
  `text-bg-*`, `ListGroupItem` is always an `<li>` with a real `<a>`/`<button>` inside.
- `@tsazor/vite-plugin`: with `check: true`, the dev server reports type errors in the
  background without blocking.
- `@tsazor/dotnet`: generated code is commented in English and imports only the validation
  decorators it uses.

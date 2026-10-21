# Blazor → Tsazor: the migration guide

Everything a Blazor developer — or an agent porting a Blazor app — needs at a glance: what stays, what changes,
and the exact Tsazor form of each C# keyword, Razor directive and Blazor API. One row, one mapping; the details
are linked. (This page also ships inside `@tsazor/runtime` as `MIGRATION.md`.)

**The rules behind every table:**

1. **Markup stays Razor.** Directives, components, `@bind`, `@onclick`, `@if`/`@foreach`, `EditForm` — as written.
2. **`@code` becomes TypeScript**, line by line. Members are camelCase; markup's `Title="…"` still sets the
   `title` parameter. Inside `@code`, `this.` is required; markup reads members without it.
3. **Blazor's names, camelCased — `Async` included**: `OnParametersSet` → `onParametersSet`, `RefreshDataAsync` →
   `refreshDataAsync`, `NavigateTo` → `navigateTo`. Exceptions are listed below.
4. **Types are erased at run time.** No `typeof(T)`, no `new T()`, no reflection; an interface can't be a DI token
   or a `@bind` converter — classes and values can.
5. **`tsazor check` is the gate** (`tsazor check && vite build`). Most errors carry their fix in the message.
6. **Strict TypeScript only** (`"strict": true`). `null`/`undefined` are checked like C#'s nullable references.

## 1. The steps

| Step | Command / page |
| --- | --- |
| Run the old app and the new one side by side, page by page | [migration.md](migration.md) (gateway, one sign-in, the API boundary) |
| Convert the markup | `npx tsazor codemod src/Pages --write` (writes `X.tsazor` next to `X.razor`) |
| Port each `@code` block to TypeScript | sections 3–5 below |
| Check | `npx tsazor check` — fix what it reports. It is the gate for the `.ts` files too: plain `tsc` sees a `.tsazor` import only as a component value, not its class |
| Before npm: install from the local registry | [getting-started.md](getting-started.md#before-the-npm-release-a-local-registry) |
| Lessons from real ports | [migration-practices.md](migration-practices.md) |

## 2. Razor → `.tsazor`

| Razor | Tsazor | Note |
| --- | --- | --- |
| `Counter.razor` | `Counter.tsazor` | file name = class name, as in Blazor |
| `Counter.razor.cs` (partial class) | `Counter.tsazor.ts`: its default export is the component's base (`export default class extends ComponentBase { … }`) | [code-behind.md](code-behind.md) |
| `_Imports.razor` | `_Imports.tsazor` | `@using`, `@import`, `@layout`, `@authorize` inherited by the folder below |
| `@page "/orders/{Id:int}"` | the same | several `@page` lines = several routes |
| `@layout MainLayout` | the same | |
| `@inherits LayoutComponentBase` | the same | |
| `@using MyApp.Shared` (namespace) | `@using ./Shared` (folder) or `@using @tsazor/bootstrap` (package) | finds component tags and `@inject` types |
| `@using MyApp.Models` for a type in `@code` | `@import { Order } from "../Models/order"` | code takes types from imports, as all TypeScript |
| `@inject NavigationManager Nav` | the same | the service must be a class |
| `@typeparam TItem` / `where TItem : IItem` | `@typeparam TItem` / `@typeparam TItem extends Item` | |
| `@attribute [Authorize(Roles = "Admin")]` | `@authorize({ roles: ["Admin"] })` | `@allowAnonymous` for `[AllowAnonymous]` |
| `@attribute [Route("/x")]` | `@page "/x"` | the codemod does it |
| `@code { … }` / `@functions { … }` | the same, the content in TypeScript | |
| the component's own type in `@code` (`MudMenu ParentMenu`) | the class name: `parentMenu?: MudMenu;` | in scope as in C#; no `@import` of the file itself |
| a static constructor, code that runs once when the class loads | `static { … }` in `@code` | text after `@code` is markup: it renders, never runs (TZS038) |
| `// …`, `/* … */` outside `@code` | `@* … *@` | markup text in Razor too — it renders (TZS038, a quick fix) |
| `@namespace`, `@implements`, `@rendermode`, `@preservewhitespace` | accepted and ignored | no render modes: Tsazor is a client SPA |
| `@Name`, `@(a + b)`, `@@`, `@* … *@`, `<text>`, `@:` | the same | |
| `@($"Hi {name}")` | `` @(`Hi ${name}`) `` | TZS024 names the literal |
| `class="btn @(active ? "on" : "")"` | the same | anything beyond a plain expression in an attribute: `@(…)` |
| `@if`, `@else if`, `@foreach (var x in xs)`, `@for`, `@while`, `@switch` | `@foreach (const x of xs)`, the rest the same | the codemod rewrites `var … in` |
| `@onclick="Save"`, `@onclick="() => Save(id)"` | `@onclick="save"`, `@onclick="() => save(id)"` | a method group keeps its receiver |
| `@onclick:preventDefault`, `:stopPropagation` | the same | |
| `@bind="Name"`, `@bind:event="oninput"`, `@bind:after`, `@bind:get`/`:set`, `@bind:format`, `@bind-Value` | the same | a text input or select converts by the bound value's type; `:culture` for culture-aware numbers |
| `@ref="input"` (an `ElementReference`) | `@ref="input"` (the DOM `Element`) | `input?.focus()` instead of `FocusAsync()` |
| `@ref="panel.PanelRef"` (a member of another object, in a loop) | `@ref="panel.panelRef"` | any assignable member or element access |
| `@key="item.Id"`, `@attributes="Extra"` | the same | |
| `(MarkupString)html` | `new MarkupString(html)` or `html as MarkupString` | |
| `@<p>@context</p>` (Razor template) | the same | in `@code` as well |
| `<Grid Items="@orders" TItem="Order">` | the same | `TItem` is inferred from `Items` where Razor infers it |
| `Context="item"` on a template | the same | |

## 3. Blazor APIs → Tsazor

### Component class and lifecycle

| Blazor | Tsazor |
| --- | --- |
| `ComponentBase` | `ComponentBase` (`@tsazor/runtime`) |
| `OnInitialized()` / `OnInitializedAsync()` | `onInitialized()` / `async onInitialized()` — one hook; TZS032 renames `onInitializedAsync` |
| `OnParametersSet()` / `OnParametersSetAsync()` | `onParametersSet()` / `async onParametersSet()` |
| `OnAfterRender(bool firstRender)` / `…Async` | `onAfterRender(firstRender: boolean)` / `async onAfterRender(…)` |
| `ShouldRender()` | `shouldRender()` |
| `@implements IHandleEvent` + `HandleEventAsync`, `EventUtil.AsNonRenderingEventHandler` | `protected override handleEventAsync(callback, arg) { return callback.invokeAsync(arg); }` — the component's events without a render |
| `SetParametersAsync(ParameterView)` | `setParametersAsync(parameters: ParameterView)` |
| `StateHasChanged()` | `this.stateHasChanged()` |
| `InvokeAsync(StateHasChanged)`, `InvokeAsync(() => …)` | call directly: one thread, nothing to marshal |
| `DispatchExceptionAsync(ex)` | `this.dispatchExceptionAsync(ex)` |
| `IDisposable.Dispose()` / `IAsyncDisposable.DisposeAsync()` | `dispose()` / `async disposeAsync()` (no interface needed) |
| subscribe in `OnInitialized`, unsubscribe in `Dispose` | `this.observe(source)` — subscribes, re-renders on change, unsubscribes on dispose |
| `CancellationTokenSource` cancelled in `Dispose` | `this.disposeSignal` (an `AbortSignal` aborted on dispose) |
| `ParameterView.GetValueOrDefault<T>("X")`, `TryGetValue`, `ToDictionary`, `FromDictionary` | `parameters.getValue<T>("X")`, `has("X")`, `toDictionary()`, `ParameterView.fromDictionary(obj)` |

### Parameters, cascading values, events, fragments

| Blazor | Tsazor |
| --- | --- |
| `[Parameter] public string Title { get; set; }` | `@Parameter() title = "";` |
| `[Parameter] public int? Count { get; set; }` | `@Parameter() count?: number;` |
| a parameter property with logic (`get => _x ?? Default; set => _x = value;`) | `@Parameter() set title(value) { … }` with its getter, or `@Parameter() accessor title` |
| `[Parameter(CaptureUnmatchedValues = true)] Dictionary<string, object> Attrs` | `@Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;` |
| `[Parameter, EditorRequired] public Todo Todo { get; set; } = default!;` | `@EditorRequired() @Parameter() todo!: Todo;` — a tag without it: warning TZS037 (Razor's RZ2012) |
| `[CascadingParameter] Theme Theme` | `@CascadingParameter({ type: Theme }) theme?: Theme;` (by type: name the class) |
| `[CascadingParameter] MudMenu ParentMenu` in `MudMenu` (its own type) | `@CascadingParameter({ type: () => MudMenu }) parentMenu?: MudMenu;` (an arrow: read when matched) |
| `[CascadingParameter] bool RightToLeft` (a primitive by type) | `@CascadingParameter({ type: Boolean }) rightToLeft?: boolean;` (`Number`, `String` alike) |
| `[CascadingParameter(Name = "Theme")]` | `@CascadingParameter({ name: "Theme" })` |
| `<CascadingValue Value="@theme" Name="…" IsFixed="true">` | the same |
| `[SupplyParameterFromQuery] public int Page { get; set; }` | `@SupplyParameterFromQuery({ type: "int" }) page?: number;` |
| `EventCallback` / `EventCallback<T>` | `EventCallback` (argument optional) / `EventCallback<T>` — not `EventCallback<void>` |
| `await OnChange.InvokeAsync(value)`, `OnChange.HasDelegate` | `await this.onChange?.invokeAsync(value)`, `hasDelegate` |
| `EventCallback.Factory.Create(this, handler)` | `EventCallback.bind(this, handler)` |
| `[Parameter] public T Value` + `ValueChanged` (two-way) | the same pair — or `@Bindable() accessor value` (both in one line) |
| `RenderFragment` / `RenderFragment<T>` | `RenderFragment` / `RenderFragment<T>` |
| `RenderFragment<TItem>` in a generic component (`@typeparam TItem`), called as `@ChildContent(item)` | `(item: TItem) => RenderFragment` — `RenderFragment<TItem>` is a conditional type TypeScript can't call while `TItem` is open |
| `ChildContent` | `childContent` (markup: the element's content) |
| `builder.OpenElement(…)` in `BuildRenderTree` | the markup — `buildRenderTree` is generated; hand-written only in `.ts` components |

### Routing and navigation

| Blazor | Tsazor |
| --- | --- |
| `App.razor` with `<Router>`, `<RouteView>`, `<FocusOnNavigate>` | `App.tsazor`, the same markup |
| `<AuthorizeRouteView>`, `<NotFound>`, `<LayoutView>` | the same |
| `Nav.NavigateTo("/x")`, `NavigateTo("/x", forceLoad: true)` | `nav.navigateTo("/x")`, `navigateTo("/x", { forceLoad: true })` (`replaceHistoryEntry` too) |
| `Nav.Uri`, `BaseUri`, `ToAbsoluteUri`, `ToBaseRelativePath` | `uri`, `baseUri`, `toAbsoluteUri`, `toBaseRelativePath` |
| `Nav.GetUriWithQueryParameter("page", 2)` | `getUriWithQueryParameter("page", 2)` (and `…Parameters`) |
| `Nav.LocationChanged += OnChanged` / `-=` | `const off = nav.addLocationChanged(onChanged)` / `off()` |
| `Nav.RegisterLocationChangingHandler(h)`, `context.PreventNavigation()` | `registerLocationChangingHandler(h)`, `context.preventNavigation()` |
| `<NavigationLock>`, `<NavLink Match="NavLinkMatch.All">` | the same |
| route constraints `{id:int}`, `{*rest}`, optional `{id?}` | the same |
| hash routing | `createTsazorApp({ routing: { mode: "hash" } })` (Tsazor extension) |

### Forms and validation

| Blazor | Tsazor |
| --- | --- |
| `<EditForm Model="@model" OnValidSubmit="@Save">` | the same |
| `<DataAnnotationsValidator />`, `<ValidationSummary />` | the same |
| `<ValidationMessage For="@(() => model.Name)" />` | `<ValidationMessage For="name" />` (the field's path) |
| `<InputText>`, `<InputTextArea>`, `<InputNumber>`, `<InputDate>`, `<InputCheckbox>`, `<InputSelect>`, `<InputFile>` | the same names |
| `<InputRadioGroup @bind-Value="…">` / `<InputRadio Value="…">` | the same — the chosen value comes back typed (a number, an enum member); the skins' `RadioGroup` styles it |
| `[Required]`, `[StringLength]`, `[Range]`, `[EmailAddress]`, `[RegularExpression]`, `[Compare]`, `[MinLength]`, `[MaxLength]` | `@Required()`, `@StringLength(…)`, `@Range(…)`, `@EmailAddress()`, `@RegularExpression(…)`, `@Compare(…)`, `@MinLength(…)`, `@MaxLength(…)` |
| `[Range]` on `decimal` | `@Range` on a `Decimal` (`@tsazor/primitives`), `@Precision(p, s)` |
| `editContext.Validate()`, `IsModified`, `GetValidationMessages`, `NotifyFieldChanged` | `validate()`, `isModified(field)`, `getValidationMessages(field)`, `notifyFieldChanged(field)` |
| `EditContext.FieldCssClass(field)`, `SetFieldCssClassProvider(p)` | `editContext.fieldCssClass(field)`, `setFieldCssClassProvider(p)` with a `FieldCssClassProvider` |
| `ValidationMessageStore` | the same (`editContext.createValidationMessageStore()`) |
| `InputBase<T>` (a custom input) | `InputBase<T>` (`currentValue`, `fieldClass`, `cssClass`) |
| `IBrowserFile.OpenReadStream()` | the native `File`: `file.text()`, `file.arrayBuffer()`, `file.size` |

### Dependency injection and startup

| Blazor | Tsazor |
| --- | --- |
| `Program.cs` | `Program.ts`: `createTsazorApp({ root: App, routes, services: (services) => { … } })` |
| `builder.RootComponents.Add<App>("#app")` | `selector: "#app"` in `createTsazorApp` |
| `builder.Services.AddSingleton<Clock>()` | `services.registerType(Clock)` (built as `new Clock(services)`) |
| `AddScoped<T>()` / `AddTransient<T>()` | `registerType(T, { lifetime: "scoped" })` / `"transient"` |
| `AddSingleton<IFoo, Foo>()` | an abstract class as the token: `services.register(Foo, (sp) => new SqlFoo(sp.get(Db)))` — interfaces don't exist at run time |
| `AddSingleton(sp => new X(sp.GetRequiredService<Y>()))` | `services.register(X, (sp) => new X(sp.get(Y)))` |
| `AddSingleton(instance)` | `services.registerValue(X, instance)` |
| `TryAddSingleton<X>()`, `TryAddScoped(…)`, `services.Any(d => d.ServiceType == typeof(X))` | `services.tryRegisterType(X)`, `tryRegister(X, factory, { lifetime })`, `tryRegisterValue`, `services.has(X)` |
| `[Inject] IServiceProvider Services`, `GetService<T>()` / `GetRequiredService<T>()` | `@inject ServiceProvider services`, `services.tryGet(T)` / `services.get(T)` |
| a library's `services.AddXyz()` | the same function over `ServiceCollection` — or `registerServiceDefault(T, create)` in the service's module |
| `IOptions<T>`, `IConfiguration`, `appsettings.json` | plain values: `import.meta.env.VITE_API_URL` (Vite), registered with `registerValue` |
| `ILogger<T>` | `console.info` / `console.warn` / `console.error` |

### HTTP and the backend

| Blazor | Tsazor |
| --- | --- |
| `@inject HttpClient Http` | `@inject TsazorHttp http` |
| `Http.GetFromJsonAsync<T>(url)` | `http.getJson<T>(url)` |
| `Http.PostAsJsonAsync(url, body)` | `http.postJson<T>(url, body)` (`putJson`, `deleteJson`, `send`) |
| `DelegatingHandler` | `http.addRequestInterceptor(…)`, `addResponseInterceptor(…)` |
| NSwag / Kiota client from OpenAPI | `npx tsazor-dotnet generate <openapi.json> --out src/api` (`@tsazor/dotnet`) |
| `ProblemDetails` | `problemMessage(result)` (`@tsazor/dotnet`) |
| SignalR | `@microsoft/signalr` directly (or Sleipnir) |

### Auth

| Blazor | Tsazor |
| --- | --- |
| `AuthenticationStateProvider`, `GetAuthenticationStateAsync()`, `NotifyAuthenticationStateChanged(task)` | the same, camelCased |
| `<CascadingAuthenticationState>`, `<AuthorizeView Roles="Admin">`, `<Authorized>`, `<NotAuthorized>`, `<Authorizing>` | the same |
| `[CascadingParameter] Task<AuthenticationState> AuthState` | `@CascadingParameter({ type: AuthenticationState }) authState?: AuthenticationState;` (no Task) |
| `user.Identity.IsAuthenticated`, `.Name`, `user.IsInRole("Admin")` | `user.isAuthenticated`, `user.name`, `user.roles.includes("Admin")` |
| `IAuthorizationService.AuthorizeAsync(user, policy)` | `authorizationService.isAuthorized(user, { policy })` |
| `[Authorize]` | `@authorize` |

### Localization

| Blazor | Tsazor |
| --- | --- |
| `IStringLocalizer<T>`, `L["Welcome", name]` | `@inject StringLocalizer L`, `L.get("Welcome", { name })` |
| `CultureInfo.CurrentCulture = …` | `@inject CultureService cultures`, `cultures.setExplicit("de-DE")` |
| `CultureInfo.CurrentCulture` | `cultures.current` (a `CultureInfo`) |
| `culture.NumberFormat.NumberDecimalSeparator` | `culture.numberFormatInfo.numberDecimalSeparator` |
| `value.ToString("N2", culture)` | `culture.formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` |
| `<html lang>` (Blazor leaves it as `index.html` has it) | follows the texts' language with `createTsazorApp({ localization })`; `documentLanguage: false` leaves it alone |

### Built-in components

| Blazor | Tsazor |
| --- | --- |
| `<PageTitle>`, `<HeadContent>`, `<HeadOutlet>` | the same |
| `<ErrorBoundary>` with `<ErrorContent Context="ex">`, `Recover()` | the same, `recover()` |
| `<SectionOutlet SectionName="…">`, `<SectionContent>` | the same |
| `<DynamicComponent Type="@typeof(Counter)" Parameters="@p">` | `<DynamicComponent Type="@Counter" Parameters="@p">` |
| `<Virtualize Items="@xs">`, `ItemsProvider`, `RefreshDataAsync()` | the same, `refreshDataAsync()` |
| `QuickGrid` | the skins' `DataGrid` with `PropertyColumn` / `TemplateColumn` |
| MudBlazor, Radzen, Fluent UI Blazor | `@tsazor/fluent`, `@tsazor/bootstrap` ([component-libraries.md](component-libraries.md)) |
| `<MudChart ChartType="ChartType.Bar" Width="100%" Height="300px">` | `<Chart chartType="bar" width="760" height="300">` (`@tsazor/charts`): `width`/`height` are the drawing's units — its shape — and the chart takes its container's width; MudChart's are CSS lengths of the box |
| `QuickGrid` / `FluentDataGrid ResizableColumns`, `MudDataGrid DragDropColumnReordering` | `DataGrid resizableColumns`, `reorderableColumns` — both off by default |

### JavaScript interop

| Blazor | Tsazor |
| --- | --- |
| `IJSRuntime.InvokeVoidAsync("localStorage.setItem", k, v)` | `localStorage.setItem(k, v)` — the code runs in the browser |
| `IJSObjectReference` / a JS module import | `import { chart } from "./chart.js"` |
| `[JSInvokable]`, `DotNetObjectReference` | none: pass a function |
| `ElementReference` + JS for focus/scroll/measure | the `Element`: `focus()`, `scrollIntoView()`, `getBoundingClientRect()` |
| JS that moves a rendered element elsewhere (a popup to `document.body`, Radzen's `openPopup`) | `portal(element)` (`@tsazor/runtime`; returns the undo) — the renderer keeps addressing it. Moved by hand, the next update fails: Tsazor finds its elements through the DOM, Blazor through its own logical tree |

## 4. C# keywords → TypeScript

| C# | TypeScript |
| --- | --- |
| `var x = 0;` / `const int Max = 5;` / `readonly` local | `let x = 0;` / `const max = 5;` / `const` |
| `int`, `long`, `double`, `float`, `byte` | `number` (`bigint` beyond 2^53) |
| `decimal` | `Decimal` (`@tsazor/primitives`) — `number` drifts (`0.1 + 0.2`) |
| `bool`, `string`, `char` | `boolean`, `string`, `string` |
| `object`, `dynamic` | `unknown` (narrow first), `any` (avoid) |
| `void` | `void` |
| `null` | `null`; absent is `undefined` — `x == null` matches both |
| `true`, `false` | the same |
| `string? s` / `int? n` (a value that can be null) | `s: string \| null` / `n: number \| null` — an optional member that can be absent is `n?: number` (`undefined`); a `@bind` field and the parameter it binds pick the same one (TS1360 otherwise) |
| `x?.y`, `x ?? y`, `x ??= y`, `x!` | the same |
| `new Order()` | `new Order()` (or an object literal `{ id: 1 }` for data) |
| `this`, `base.Save()`, `base(name)` | `this` (required), `super.save()`, `super(name)` |
| `class`, `abstract`, `static`, `override` | the same |
| `sealed`, `virtual` | none: every method can be overridden |
| `interface IFoo` | `interface Foo` (structural; not at run time) |
| `struct` | a `class` or a `readonly` object type |
| `record Order(int Id)` | `interface Order { readonly id: number }` or a `class`; copy: `{ ...o, id: 2 }` (`with`) |
| `enum Status { Open }`, `[Flags]` | `enum Status { Open }` or a union `"open" \| "closed"`; flags with `\|` |
| `public` / `private` / `protected` / `internal` | the default / `private` or `#x` / `protected` / not exported |
| `readonly` field, `const` field | `readonly`, `static readonly` |
| `required` | a property without `?` |
| `get; set;`, `init` | a field; `readonly` |
| `T Max<T>(…) where T : IComparable<T>` | `max<T extends Comparable<T>>(…): T` |
| `typeof(T)`, `nameof(x)`, `sizeof` | none (erased) / `"x"` / none |
| `default(T)` | `undefined` |
| `x is Order o`, `x is null`, `x is not null` | `x instanceof Order`, `x === null`, `x !== null` (`== null` for both nothings) |
| `x as Order` | `x as Order` — an unchecked assertion |
| `switch` statement | the same (`break` required: TZS023 warns on fall-through) |
| `switch` expression `x switch { 1 => "a", _ => "b" }` | a ternary, an object lookup, or `switch` with `return` |
| `when` (case guard, `catch when`) | an `if` inside the case / `catch (e) { if (…) … else throw e; }` |
| `foreach (var x in xs)` | `for (const x of xs)` |
| `for`, `while`, `do`, `break`, `continue`, `return`, `goto case` | the same; no `goto` |
| `try`, `catch (FooException e)`, `finally`, `throw` | `try`, `catch (e) { if (e instanceof FooError) … }`, `finally`, `throw new Error("…")` |
| `async Task<T> LoadAsync()`, `await` | `async loadAsync(): Promise<T>`, `await` |
| `Task.WhenAll`, `Task.Delay(500)` | `Promise.all`, `new Promise((r) => setTimeout(r, 500))` |
| `CancellationToken` | `AbortSignal` |
| `IEnumerable<T>`, `yield return` | `Iterable<T>`, `function*` with `yield` |
| `IAsyncEnumerable<T>`, `await foreach` | `AsyncIterable<T>`, `for await (const x of xs)` |
| `delegate`, `Func<int, string>`, `Action<T>` | function types: `(n: number) => string`, `(t: T) => void` |
| `event EventHandler Changed` | a callback list or `EventTarget`; in components: `EventCallback` |
| lambda `x => x * 2` | `(x) => x * 2` |
| `out int value`, `ref` | return a tuple or an object: `const [ok, value] = tryParse(s)` |
| `params int[] xs` | `...xs: number[]` |
| optional parameter `int n = 1`, named argument `f(n: 2)` | `n = 1`; pass an options object `f({ n: 2 })` |
| overloads | overload signatures over one implementation, or union parameters |
| extension method | a plain function: `formatMoney(order.total)` |
| `operator +`, `implicit`/`explicit` conversions | methods: `a.add(b)`, `Decimal.from(x)` |
| `partial class` | the `.tsazor` + `.tsazor.ts` pair (code-behind) |
| `namespace`, `using X;` | ES modules: `import { X } from "./x"`; `export` makes it visible |
| `using var conn = …;`, `using (…) { }` | `try { … } finally { conn.dispose(); }` (or TS `using` with `Symbol.dispose`) |
| `lock`, `volatile`, `Thread` | none: one thread; Web Workers for heavy work |
| `checked`, `unchecked`, `unsafe`, `fixed`, `stackalloc` | none |
| `$"…{x}…"`, `@"C:\path"` | `` `…${x}…` ``, `String.raw` or `"C:\\path"` |
| `string.Empty`, `string.IsNullOrEmpty(s)`, `IsNullOrWhiteSpace` | `""`, `!s`, `!s?.trim()` |
| `Attribute` (`[Obsolete]`) | a decorator (`@Required()`), or `/** @deprecated */` |

## 5. .NET types and calls → TypeScript

| .NET | TypeScript |
| --- | --- |
| `s.Length`, `ToUpper()`, `ToLower()`, `Trim()`, `Contains`, `StartsWith`, `Replace`, `Split`, `Substring(i, n)` | `s.length`, `toUpperCase()`, `toLowerCase()`, `trim()`, `includes`, `startsWith`, `replaceAll`, `split`, `slice(i, i + n)` |
| `string.Join(", ", xs)`, `string.Format` | `xs.join(", ")`, a template literal |
| `string.Compare(a, b, ignoreCase)` | `a.localeCompare(b, undefined, { sensitivity: "base" })` |
| `int.Parse(s)`, `int.TryParse(s, out n)`, `double.Parse` | `Number(s)` (check `Number.isNaN`), `Number.parseInt(s, 10)`, `Number.parseFloat(s)` |
| `x.ToString("N2")`, `ToString("C")` | `x.toFixed(2)`, `new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(x)` |
| `Math.Round(x, 2)`, `Math.Max`, `Math.Floor` | `Math.round(x * 100) / 100` (a `Decimal`: `d.round(2)`), `Math.max`, `Math.floor` |
| `List<T>`: `Add`, `AddRange`, `Remove`, `RemoveAt`, `Insert`, `Count`, `Clear` | `T[]`: `push`, `push(...xs)`, `splice(xs.indexOf(x), 1)`, `splice(i, 1)`, `splice(i, 0, x)`, `length`, `length = 0` |
| `Dictionary<K, V>`: `[k]`, `TryGetValue`, `ContainsKey`, `Remove`, `Keys` | `Map<K, V>`: `get(k)`, `get(k) ?? …`, `has(k)`, `delete(k)`, `keys()` |
| `HashSet<T>` | `Set<T>` |
| `T[]`, `Array.Empty<T>()` | `T[]`, `[]` |
| `IReadOnlyList<T>` | `readonly T[]` |
| LINQ `Where`, `Select`, `First(OrDefault)`, `Any`, `All`, `OrderBy`, `GroupBy`, `Sum`, `Distinct`, `Take`, `Skip` | `filter`, `map`, `find`, `some`, `every`, `toSorted`, `Object.groupBy`, `reduce`, `[...new Set(xs)]`, `slice(0, n)`, `slice(n)` — [the full table](csharp-to-typescript.md#linq-to-objects) |
| `DateTime.Now`, `DateTime.UtcNow` | `new Date()` (an instant; local or UTC only when formatted) |
| `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid` | `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid` (`@tsazor/primitives`) |
| `date.ToString("d", culture)` | `culture.formatDate(date, { year: "numeric", month: "numeric", day: "numeric" })` — `dateStyle: "short"` writes the year with two digits (`21.10.26`), .NET's `d` with four |
| `date.ToString("G", culture)` | the `d` above, a space, then `culture.formatDate(date, { hour: "numeric", minute: "2-digit", second: "2-digit" })` (Intl's own date-and-time joiner differs: `21/10/2026، 8:29` in Arabic) |
| `Guid.NewGuid()` | `Guid.newGuid()` (or `crypto.randomUUID()`) |
| `Exception`, `InvalidOperationException`, `ArgumentException` | `Error`, `class InvalidOperationError extends Error {}` |
| `JsonSerializer.Serialize` / `Deserialize<T>` | `JSON.stringify` / `JSON.parse(text) as T` (unchecked) |
| `Console.WriteLine` | `console.log` |
| `Environment`, `IConfiguration` | `import.meta.env` |
| `Random.Shared.Next(n)` | `Math.floor(Math.random() * n)` |
| `Stopwatch` | `performance.now()` |
| `Regex.IsMatch(s, p)` | `/p/.test(s)` |
| `Regex` with `\p{L}`, `RegexOptions.IgnoreCase` | `/\p{L}/u`, `/…/i` — a Unicode class needs the `u` (or `v`) flag: without it `\p{L}` silently matches the text `p{L}`. No inline `(?i)`, no atomic groups `(?>…)` or possessive quantifiers; `(?<name>…)` is the same |
| `Encoding.UTF8.GetBytes` | `new TextEncoder().encode(s)` |

More: strings, numbers, dates, collections, exceptions, disposal — [csharp-to-typescript.md](csharp-to-typescript.md).

## 6. Not there, or different by design

| Blazor | In Tsazor |
| --- | --- |
| Render modes, prerendering, `PersistentComponentState`, static SSR forms | a client SPA; SSR comes after 1.0 |
| `IJSRuntime`, `[JSInvokable]` | not needed (section 3, JavaScript interop) |
| `InvokeAsync`, `SynchronizationContext` | not needed: one thread |
| `typeof(T)`, `Type`, reflection, `Activator.CreateInstance` | types are erased; pass the class (`DynamicComponent Type="@Counter"`) |
| an interface as a DI token or a cascading type | a class (an abstract class works) |
| `ElementReference.Id` | the `Element` itself |
| `ParameterView.DidParameterChange` (a Radzen extension, not Blazor) | `parameters.getValue("x") !== this.x` |
| the field's C# type deciding `@bind`'s conversion | the bound value's type at run time; a field that starts as `null` gets the text — start a number field with a number |

## 7. Diagnostics you meet first

| Code | Means | Fix |
| --- | --- | --- |
| TZS021 | a C# form (`var x in xs`, `where T : X`, `[Authorize]`) | the TypeScript form the message names |
| TZS022 | `var` | `let` / `const` |
| TZS024 | not TypeScript (`$"…"`, casts, `new { … }`, `is not null`) | the form the message names (a template literal for C# strings) |
| TZS032 | a Blazor lifecycle name (`OnInitializedAsync`, `Dispose`) | `onInitialized`, `dispose` (the quick fix renames) |
| TZS005 | an unresolved component tag | `@using` the folder or package, or `@import` the component |
| TZS025 | an unknown component parameter | the spelling; the message suggests the closest |
| TZS037 (warning) | an `@EditorRequired()` parameter the tag leaves out | set it (an attribute, `@bind-`, element content for `ChildContent`) |
| TZS038 (warning) | a `//` or `/* … */` comment outside every element, a call after `@code` — text that renders | `@* … *@` (quick fix); code that runs at load in `static { }` in `@code` |
| TZS039 (warning) | an unnamed `@CascadingParameter()` without `type` — Blazor matches it by the property's type, Tsazor can't | `{ type: X }` (quick fix from the annotation), or the name its supplier gives |
| TZS004 | an `@` no expression follows — in an attribute value too (``transform="@`…`"``) | `@name`, `@(…)` (the quick fix for a template literal), `@@` for the character |
| TZS008 | a misused directive attribute (`@bind:event` naming no callback, `:after` with `:set`) | as the message says |
| TS2304 | a name `@code` doesn't know | `@import` it — the message names the import |
| TS2339 on the component | markup read a missing import as a member (`Shade.Dark`) | the `@import` the message names |
| TS2307 | a module not found | the message names the folder it resolved from and the specifier that finds it |
| TS1361 | `@inject` of a type-only import | import without `type` (or leave the import out) |
| TS2532 / TS18048 | possibly `undefined` (often inside your own lambda) | check first, or take a local: `const current = this.model;` |

All codes with examples: the reference's Diagnostics page, [language-reference.md](language-reference.md#diagnostics).

## 8. The traps

1. **Narrowing doesn't reach into your own lambdas.** `@if (model != null) { <button @onclick="() => save(model.id)"> }` is TS2532: take a local or pass the value in.
2. **`||` is not `??`.** `count || 10` replaces `0` too; use `??`.
3. **`=== null` misses `undefined`.** Generated clients mark absent members optional: check `x == null`.
4. **`sort()` sorts in place and as strings.** Use `toSorted((a, b) => a - b)`.
5. **A method passed on loses `this`.** `setTimeout(this.tick, 100)`, `EventCallback.unbound(this.tick)` — write `() => this.tick()` (markup's `@onclick="tick"` and a method passed to a parameter keep it for you).
6. **`@bind` on a field that starts as `null`** gets the text: start number fields with a number.
7. **Relative specifiers resolve from the file they're written in** — a page in `Pages/` imports `../Store`.
8. **`@inject` needs the class at run time**: not an `import type`, not an interface.
9. **An enum in markup needs its `@import`** (`Shade="Shade.Dark"`).
10. **Objects compare by reference.** Where Blazor relied on `Equals`, give a key: `@key`, `ItemKey`, `ItemComparer`.
11. **`substring(a, b)` is not `Substring(start, length)`.** Its second argument is the end: `s.Substring(1, s.Length - 2)` is `s.slice(1, -1)` — the wrong one cuts quietly.
12. **`\p{L}` without the `u` flag matches the text `p{L}`.** A .NET pattern with a Unicode class needs `/…/u`; atomic groups and possessive quantifiers have no JavaScript form.
13. **A comment outside `@code` renders.** `// …` and `/** … */` are markup text, as in Razor (TZS038): `@* … *@` — a leading `@** … *@` is the component's doc comment.

More, with the ports they came from: [migration-practices.md](migration-practices.md).

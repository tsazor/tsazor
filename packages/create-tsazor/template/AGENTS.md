# %APP_NAME% — notes for coding agents

A [Tsazor](https://github.com/tsazor/tsazor) app: Blazor's component model and Razor syntax in `.tsazor` files, with
strict TypeScript in `@code` instead of C#, built by Vite. Read this file first; the
[language reference](https://github.com/tsazor/tsazor/blob/main/docs/language-reference.md) is the full manual.

%APP_SETUP%

## Verify every change

| Command | What it checks |
|---|---|
| `npm run check` | `tsazor check`: TypeScript over the markup and the code — types of parameters, `@bind`, events, imports |
| `npm test` | Vitest with `@tsazor/testing` (`render(Component)`, `find`, `click`, `change`) |
| `npm run build` | `check`, then the production build |

Run `npm run check` after every edit of a `.tsazor` file; its diagnostics (`TZS0xx`) say what to change.

## The files

| Path | Role |
|---|---|
| `src/Program.ts` | `createTsazorApp({ root: App, routes, services })` — DI registrations go in `services` |
| `src/_Imports.tsazor` | `@using` and `@import`s every `.tsazor` below it gets (Blazor's `_Imports.razor`) |
| `src/App.tsazor` | the Router |
| `src/Layout/` | `MainLayout.tsazor` (`@inherits LayoutComponentBase`, `@Body`) and the nav menu |
| `src/Pages/X.tsazor` | a page: `@page "/x"`; the component class is named `X` after the file |
| `X.tsazor.css` | scoped CSS of `X` only |
| `X.tsazor.ts` | optional code-behind: `export default class X extends ComponentBase` |
| `X.test.ts` | its tests, next to it |

## Core patterns

A page with a parameter from the route, a service, and state:

```razor
@page "/orders/{id:int}"
@import type { Order } from "../api/models"
@inject OrdersApi Api

<h1>Order @id</h1>
@if (order === null) {
    <p>Loading…</p>
} else {
    <p>@order.customer — @order.total.toFixed(2) €</p>
}

@code {
    @Parameter() id = 0;
    private order: Order | null = null;

    protected override async onParametersSet(): Promise<void> {
        this.order = await this.Api.get(this.id);
    }
}
```

- **Members:** in markup, a member of the component is written bare (`@order`); in `@code` it is `this.order`.
  The lifecycle is Blazor's in camelCase: `onInitialized`, `onParametersSet`, `onAfterRender(firstRender)`,
  `stateHasChanged()` — one method each, `async` where Blazor has the `…Async` twin (there is no
  `onInitializedAsync`).
- **Parameters:** `@Parameter() name = default;` — a parent passes it as `<Child Name="@value" />` (PascalCase in
  markup, as in Blazor). Two-way: `@Bindable() accessor value = 0;` and `<Child @bind-Value="x" />`.
- **Events:** `@onclick="increment"` or `@onclick="() => this.add(item)"`; a callback parameter is
  `@Parameter() onSaved?: EventCallback<Order>;`, raised with `await this.onSaved?.invokeAsync(order)`.
- **Services:** a class is its own token. Register in `Program.ts` (`services.register(OrdersApi, (s) => new
  OrdersApi(s.get(TsazorHttp)))`), inject with `@inject OrdersApi Api` (or `inject(OrdersApi)` in a `.ts` class).
- **Live data:** `this.observe(source, (value) => …)` subscribes for the component's lifetime and re-renders per
  value — stores, RxJS, SSE, SignalR, Sleipnir. `{ next, complete, error }` instead of a function hears the end of
  a stream; `sequenced(source, (e) => e.seq)` drops replayed events. `ConnectionState` / `<ConnectionStatus />` show
  whether the connection is up.

A form with validation rules on the model and the server's field errors:

```ts
// Order.ts
import { Range, Required } from "@tsazor/runtime";
export class OrderForm {
    @Required() customer = "";
    @Range(1, 99) quantity = 1;
}
```

```razor
<EditForm EditContext="@editContext" OnValidSubmit="@save">
    <DataAnnotationsValidator />
    <InputText @bind-Value="model.customer" />
    <ValidationMessage For="customer" />
    <InputNumber @bind-Value="model.quantity" />
    <ValidationMessage For="quantity" />
    <button type="submit">Save</button>
</EditForm>

@code {
    private model = new OrderForm();
    private editContext = new EditContext(this.model);
    private serverErrors = new ServerValidationErrors(this.editContext);

    private save = async (): Promise<void> => {
        const result = await this.Api.save(this.model);
        if (!result.ok) this.serverErrors.apply(result.validationErrors); // "Items[0].Sku" lands at items.0.sku
    };
}
```

A test:

```ts
import { expect, test } from "vitest";
import { render } from "@tsazor/testing";
import Counter from "./Counter.tsazor";

test("increments", async () => {
    const counter = await render(Counter, { services: (s) => s.registerValue(Clock, fakeClock) });
    await counter.click("button");
    expect(counter.find("[role=status]").textContent).toBe("Current count: 1");
});
```

## The component library

`@tsazor/fluent` and `@tsazor/bootstrap` have the same components with the same parameters. The ones apps reach for:

- **DataGrid:** `<DataGrid Items="@orders" AriaLabel="Orders">` with `<PropertyColumn Property="(o) => o.customer"
  Sortable="@true" />` and `<TemplateColumn>`; `Pagination`, `SelectionMode`, `Virtualize`, `OnRowClick` (put the
  same action in a cell as a link too), `RowClass`.
- **Dialogs:** `@inject DialogService Dialogs`, `const dialog = this.Dialogs.show(EditOrder, { title, parameters })`,
  `await dialog.result`; a `<DialogProvider />` in the layout (the library's setup adds it).
- **Toasts:** `@inject Toaster Toaster`, `this.Toaster.show({ message, intent: "success" })`.
- **Charts** (`@tsazor/charts`): `<Chart ChartType="bar" ChartSeries="@series" ChartLabels="@labels" />`;
  `categories` on a series colors each bar by a category.
- **Texts:** the components' own texts are English; a German app spreads `germanFrameworkTexts` from
  `@tsazor/ui/texts/de` into its German string table.

## Pitfalls

- **No import inference.** Every name the markup or `@code` uses is imported (`@import`, or `_Imports.tsazor`) —
  a type too (`@import type { Order } from "./models"`). Components are found by `@using` folders and packages.
- **The class is named after the file.** `Overview.tsazor` declares `Overview`; an imported type of the same name
  collides (TZS041). Alias the import (`{ Overview as OverviewDto }`) or rename the file (`OverviewPage.tsazor`).
- **Strict TypeScript only.** Keep `"strict": true`; annotate empty arrays and `null` starts (`Order[]`,
  `Order | null`).
- **`this.` in `@code`, bare in markup.** A lambda in markup that assigns needs the member written as in TypeScript:
  `@onclick="() => this.count++"`.
- **Whitespace and expressions** follow Razor: an implicit `@expr` ends at a space — write `@(a + b)`.
- **Bind numbers to number inputs.** `<input @bind="price">` with `price: number | null` gets a string while it is
  null (TZS040); use `type="number"`, `InputNumber`, or the library's `NumberInput`.
- **Async handlers** render after their `await`s on their own; call `stateHasChanged()` only for changes Tsazor
  can't see (a timer, a callback of a library).

## Which sample to copy

| For | Look at (in the Tsazor repository) |
|---|---|
| Pages, layout, forms, validation | `apps/demo` |
| A REST backend with a typed client, auth, admin pages | `apps/blazorhero` (`@tsazor/dotnet`) |
| Live data from a Sleipnir backend, job progress, server field errors | `apps/sleipnir-ticker` |
| Every component of a skin | `apps/gallery` |
| Hosting in ASP.NET Core | `dotnet new tsazor` (the `Tsazor.Templates` package) |

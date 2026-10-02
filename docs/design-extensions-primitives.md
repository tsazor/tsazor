# Design draft — `@tsazor/primitives` and `@tsazor/extensions` ("feel-at-home" packages)

Status: **accepted** (2026-10-02, decisions X1–X4 below).

**Goal:** opt-in packages that give .NET developers familiar building blocks where JavaScript
has real gaps, written in idiomatic TypeScript (camelCase, Promises, real arrays/maps, no `out`
parameters) but with recognizable names and concepts. They are useful to everyone, not only to
teams with a .NET backend (design-principles: "Backend options stay open").

**Not a goal: BCL clones.** `List<T>.Add`, `Dictionary.TryGetValue`, `Enumerable` LINQ,
`StringBuilder` and similar wrappers around things TypeScript already has are deliberately not
built. They break interop (every TS library expects real arrays and maps), some can't be mapped
1:1 (`out` parameters), and they bend TypeScript towards C#. Familiarity comes from the
architecture (components, DI, EditForm, the HttpClient pipeline), not from collection syntax.
Lazy LINQ-style chains exist natively as ES2025 iterator helpers, and the cheat sheet
(`docs/csharp-to-typescript.md`) shows them.

---

## `@tsazor/primitives`

### `Decimal` (priority: highest, business apps)

`number` is an IEEE double: `0.1 + 0.2 !== 0.3`, and money arithmetic drifts. `Decimal` is an
immutable, arbitrary-precision base-10 type with .NET-like semantics:

```ts
const net = Decimal.from("19.99").mul(3);           // 59.97
const gross = net.mul("1.19").round(2, "toEven");    // MidpointRounding.ToEven (banker's) by default
gross.toString();                                    // "71.36"
gross.format("de-DE", { style: "currency", currency: "EUR" }); // "71,36 €" via Intl
```

- **Operations:** `add`, `sub`, `mul`, `div` (with scale and rounding), `compare`/`equals`,
  `round` with the `MidpointRounding` modes `toEven`/`awayFromZero`/`toZero`/`toPositive`/`toNegative`.
- **Wire format: strings.** JSON numbers lose precision. ASP.NET can serialize `decimal` as a
  string (`JsonNumberHandling.WriteAsString`). `@tsazor/dotnet` generates `Decimal` for
  `format: decimal` (or a configured mapping) and parses and serializes it as a string.
- **Forms:** `@bind` on a `Decimal` field parses and formats through E8 culture formatting;
  validation decorators `@Range` and `@Precision(…)` work on it.
- **Implementation:** a BigInt-based scaled integer, with zero dependencies (policy E3).

### `TimeSpan`, `DateOnly`, `TimeOnly`, `Guid`

- `TimeSpan`: `fromMinutes`, `totalSeconds`, `add`, ISO 8601 duration and .NET `"c"` format
  parsing (`"1.02:03:04"`). `DateOnly`/`TimeOnly` avoid `Date`'s time-zone pitfalls for dates
  without times (birthdays, contract dates). They map to the JS Temporal types once those are
  broadly available.
- `Guid`: `Guid.newGuid()` (crypto.randomUUID), `parse`, `empty`, `equals`.
- `@tsazor/dotnet` maps `format: date` → `DateOnly`, `format: duration`/the .NET TimeSpan shape
  → `TimeSpan`, `format: uuid` → `Guid` (**on by default**, decision X4: there are no 1.x users yet, so the default
  is set now; a generator flag switches back to `string`).

## `@tsazor/extensions` (in the spirit of `Microsoft.Extensions.*`)

### Http: `HttpClient`, named/typed clients, handlers

```ts
services.addHttpClient("api", {
  baseAddress: import.meta.env.VITE_API_URL,
  handlers: [AuthHandler, RetryHandler, LoggingHandler],   // DelegatingHandler pipeline, DI-resolved
});
services.addHttpClient(OrdersClient, { name: "api" });      // typed client, like AddHttpClient<T>
```

```razor
@inject HttpClient Http
@inject IHttpClientFactory Factory
```

- **Handlers** are classes with `send(request, next, signal)`. Order and DI resolution work as in
  .NET; ready-made handlers cover retry with backoff, timeout, auth (bearer from a provider, or
  the BFF cookie), correlation ID, and logging.
- **Built on the runtime's `TsazorHttp`.** The interceptor mechanism and `getJson`/`postJson`
  stay; `HttpClient` is the familiar facade. Parity note: in Blazor, `@inject HttpClient Http` is
  the standard line, so the runtime could expose `HttpClient` as an alias for its default client
  (a codemod-friendly parity improvement), independent of this package.
- **Split with `@tsazor/dotnet`:** generic Http moves here. `@tsazor/dotnet` keeps the
  .NET-specific parts: the OpenAPI generator, ProblemDetails/`HttpResult`, auth providers, and
  the envelope. Its generated clients take an `HttpClient`.

### Logging: `Logger<T>`

```razor
@inject Logger<OrderPage> Log
@code { protected override onInitialized() { this.Log.information("Opened order {id}", this.id); } }
```

- Levels `trace` … `critical`, categories, message templates with named placeholders (structured
  properties, not string concatenation), scopes. The default sink is the console (filtered by
  level); there are sinks for HTTP (batching to an ASP.NET endpoint) and custom implementations.
  Production builds strip below a configured level.

### Options: `Options<T>`

```ts
services.configure(ApiOptions, { section: "api", source: import.meta.env, validate: true });
```

```razor
@inject Options<ApiOptions> Api
```

- Typed configuration classes with validation decorators (the same 3.6 decorators), validated at
  startup (`ValidateOnStart`). This replaces scattered `import.meta.env` lookups.

### `CancellationToken` ↔ `AbortSignal`

- No new type: `AbortSignal` is the platform's cancellation token. The extensions accept a
  `signal` everywhere (Http, logging flush), and `disposeSignal` already connects it to the
  component lifetime. The cheat sheet documents the mapping.

---

## Tutorial and docs

- The cheat sheet gets a line per package ("in .NET you use X, here it is Y").
- The Blazor track's C# chapter points to `Decimal` in "The real traps" (money).
- New lessons, both tracks:
  - Part 3 "Talking to a backend": `HttpClient` with handlers.
  - Part 2 "Services": `Logger`/`Options` as examples of DI services.

## Order

1. `Decimal`, with the `@tsazor/dotnet` mapping and `@bind`/validation support. This depends on
   E8 culture formatting, so it comes after or together with E8.
2. `HttpClient` + factory + handlers, then the `@tsazor/dotnet` split.
3. `Logger`, `Options`.
4. `TimeSpan`, `DateOnly`, `TimeOnly`, `Guid` and the generator mappings.

## Decisions (2026-10-02)

| # | Question | Decision |
|---|---|---|
| X1 | Package split: two packages or one `@tsazor/extensions`? | two: `primitives` (pure values, no DI) and `extensions` (DI services) |
| X2 | `HttpClient` alias in the runtime for Blazor parity (`@inject HttpClient Http`)? | yes, independent of X1 |
| X3 | `Decimal` default rounding | `toEven` (as .NET `Math.Round`), with explicit modes |
| X4 | Generator mappings for `Decimal`/`DateOnly`/`Guid` on by default? | **always on** (user decision: set the default before 1.0; opt-out flag for `string`) |

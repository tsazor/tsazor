# Design draft — Localization and culture (E8)

Status: **decided** (2026-10-02). Open decisions resolved as recommended (see §8); the doc is
the basis for implementation. Counterpart to Blazor's `IStringLocalizer`/`CultureInfo`/
`@bind:culture`, built on `Intl`.
Requirements come from the first business-SPA port (port-findings R.1/R.2), not from
speculation. Under the v1 superset rule: everything Blazor's localization does has a counterpart,
plus the automatic re-render (a Tsazor extension, clearly marked).

**Policy revision (A5/B7):** the invariant-only policy keeps routing, query strings and all data
exchange (JSON, API values) invariant. Culture enters only at the display/input boundary — what
Blazor calls UI culture. `@bind:format` alone stays invariant (Blazor's `BindConverter` is
invariant too); culture-aware input goes through `@bind:culture`.

---

## 1. `CultureInfo` — the culture value, over `Intl`

`CultureInfo` is a thin, immutable wrapper around a BCP-47 locale tag. No .NET calendar,
`CompareInfo` or `TextInfo` ports (no BCL clones — design-principles): everything formatting goes
to `Intl` with the locale as the only state.

```ts
export class CultureInfo {
  static readonly invariant: CultureInfo;          // "" — .NET's InvariantCulture
  constructor(locale: string);                     // "de-DE", "en-US", "de"
  get name(): string;                               // "" or the tag as written
  get displayName(): string;                       // via Intl.DisplayNames, in this culture

  // Formatting helpers (thin Intl wrappers; the options are Intl's own):
  numberFormat(options?: Intl.NumberFormatOptions): Intl.NumberFormat;
  dateFormat(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat;
  formatNumber(value: number, options?): string;
  formatDate(value: Date, options?): string;
}
```

A malformed tag throws (like .NET's `CultureInfoNotFoundException` — better at construction than
at every `Intl` call). The constructor is the only validation; `Intl` does the rest.

**Culture state is a DI service, not a static** (open decision D-L1): a singleton `CultureService`
holds the current culture and the change notifications. Blazor's `CultureInfo.CurrentCulture` is
thread-static ambient state; in a SPA there is one thread, but there may be two apps on a page
(main app + iframe) and there are tests — ambient module state breaks both, the way
`NavigationManager` would if it were static. `NavigationManager` is the model: owned by
`createTsazorApp`, registered in DI, injected where needed.

```ts
export class CultureService {
  get current(): CultureInfo;
  /** Explicit selection (URL parameter, host postMessage). Wins, and locks: */
  setExplicit(culture: string | CultureInfo): void;
  /** From the user profile (e.g. the token response). Ignored once explicit. */
  setFromProfile(culture: string | CultureInfo): boolean;   // false = locked out
  /** The app default; lowest priority. */
  setDefault(culture: string | CultureInfo): void;
  /** Culture-aware components re-render on this (see §3). */
  subscribe(listener: ObserveListener<CultureChangedEventArgs>): () => void;
}

export interface CultureChangedEventArgs {
  readonly previous: CultureInfo;
  readonly current: CultureInfo;
  readonly reason: "explicit" | "profile" | "default";
}
```

The port's priority rule ("explicitly set locks later profile values") is exactly this three-way
setter set: `setExplicit` wins over `setFromProfile` for the service's lifetime. The priority
*wiring* — reading the URL parameter, listening for `postMessage`, fetching the profile — is
app code; the framework provides the state machine and a documented recipe (see §6).

`createTsazorApp` registers `CultureService` by default (current = invariant), the way it
registers `NavigationManager`:

```ts
createTsazorApp({
  localization: {
    defaultCulture: "de-DE",
    tables: {                                        // see §2
      "de-DE": () => import("./i18n/de-DE.js"),
      "en-US": enTable,                              // a table value or an async loader
    },
  },
  // …
});
```

---

## 2. `StringLocalizer` — the `IStringLocalizer` counterpart

One service, one flat key space. Blazor's `IStringLocalizer<T>` marks the resource class `T`; in
TS the tables are plain modules and the key space is the app's convention (recommended:
dot-namespaced keys, `"Orders.Title"`), so there is no `T` to carry.

```ts
export class StringLocalizer<Keys extends string = string> {
  get culture(): CultureInfo;                 // the CultureService's current culture

  /** The translation: L.get("Welcome", { name: "Ann" }) → "Willkommen, Ann!" */
  get<K extends Keys>(key: K, params?: PlaceholdersOf<Table[K]>): string;
  /** Blazor's GetAllStrings — all keys of a culture's loaded table. */
  all(culture?: CultureInfo): readonly { key: string; value: string }[];
  /** The culture-aware re-render source (§3 subscribes automatically). */
  subscribe(listener: ObserveListener<void>): () => void;
}
```

`get` (open decision D-L2), not Blazor's indexer `L["Welcome"]`: a class index signature cannot
carry methods in TS, so the indexer would need a `Proxy` plus typing workarounds — bent TS for a
C# shape, exactly what the clean-TS rule rules out. `get` also carries the placeholders in one
call, where .NET needs `string.Format` afterwards.

### Tables

A table is a flat object of key → message:

```ts
// i18n/de-DE.ts
export default {
  "Welcome": "Willkommen, {name}!",
  "Orders.Title": "Bestellungen",
} satisfies StringTable;
```

- **TS modules, not JSON, are the recommended form** (open decision D-L3): the literal export
  type gives typed keys for free, and an async loader is just `() => import("./i18n/de-DE.js")`
  (one bundle chunk per culture — exactly the "tables load asynchronously" requirement). JSON
  works too (`resolveJsonModule` gives literal types), but a TS module can hold
  non-message constants and stays toolable.
- **Typed keys:** `StringLocalizer<Table>` is parameterized by the *default culture's* table type
  — the registration site fixes it once:

  ```ts
  import de from "./i18n/de-DE.js";
  services.register(StringLocalizer as Token<StringLocalizer<typeof de>>,
    (p) => new StringLocalizer({ culture: p.get(CultureService as Token<CultureService>),
                                 defaultCulture: "de-DE",
                                 tables: { "de-DE": de, "en-US": () => import("./i18n/en-US.js") } }));
  ```

  A factory, not `registerValue`, so the typed localizer resolves the *shared* `CultureService`
  through the provider (a value registration would need the service instance at registration time —
  `createTsazorApp` builds it, app code usually doesn't). `@inject StringLocalizer<typeof de> L`
  in markup works because `@inject` emits the type text verbatim. Unknown keys are then plain TS
  errors in every consumer — checked by the compiler for free, no extra `tsazor check` rule needed.
  **Typed placeholders** (open decision D-L4): `PlaceholdersOf<Table[K]>` extracts `{name}` from
  the message's literal type with a
  template-literal type, so `L.get("Welcome")` (missing `name`) and `L.get("Welcome", { nmae })`
  are errors. Pure type-level, zero runtime cost; it is the "type safety is a requirement"
  principle applied to text.
- **Missing keys and missing locales — fallback, never throw.** The port's app threw on a missing
  key; the finding calls that wrong. Chain: current culture's table → default culture's table →
  the key itself. A missing key warns in dev mode (`import.meta.env.DEV`), like `observe`'s
  warnings, and is silent in production. A locale without a table is not an error either — it
  renders the default culture until its table loads (see async).
- **Async tables:** a loader returns a promise. Until it resolves, `get` serves the fallback
  chain, and when the table arrives the localizer notifies — which re-renders every
  culture-aware component (§3), so a page that mounted before its table loaded heals itself.
  `all()` of a culture returns only the loaded table.
- **Placeholders** (open decision D-L5): named `{name}` (recommended) with `{{` as the literal
  brace — .NET 8's `CompositeFormat` named placeholders; the port's Svelte-heritage tables use
  `{{name}}`, which a codemod or a regex converts. Unmatched params are ignored, missing params
  render the placeholder text (dev warning).
- **The snapshot trap (R.1):** text that is *stored* (navigation entries, menu items in data
  models) does not change language on culture switch. The framework can't fix stored strings, so
  the API supports the correct pattern: store the **key**, translate at render
  (`menu.map(item => ({ …item, label: L.get(item.labelKey) }))`). `Keys` is just `string`, so
  storable keys cost nothing. The patterns doc (E4) carries the rule with the trap's story.

---

## 3. Re-render on culture change — the Tsazor extension

The port's core pain: every translating component must remember `this.observe(loc)`. Forget it
once and the component is silently stuck in the old language. Blazor has no answer (Blazor
doesn't re-render on culture change at all), so this is a marked superset extension:

**Injecting a culture-aware service subscribes the component automatically.**

- `CultureService` and `StringLocalizer` are `Subscribable` and carry an internal
  auto-render marker.
- `inject()` (module-level, the `@inject` path) and `ComponentBase.inject` resolve the service;
  the renderer already activates the provider around component construction
  (`withServices`) — it additionally tracks the component under construction, and when the
  resolved service is marked, the component `observe`s it. Same coalescing, same teardown on
  dispose, same error path as a hand-written `observe` — the extension is only *who* calls it.
- So `@inject StringLocalizer L` in a component is the whole story: use `L.get(…)` in the
  render tree; a culture switch re-renders it.

```razor
@inject StringLocalizer L

<h1>@L.get("Welcome", { name: user.name })</h1>
```

Alternatives (open decision D-L6):

1. **Tree re-render on culture change** (Blazor-ish "it just happens"): renders components that
   translate nothing, and hides from readers *which* components are culture-aware. Rejected as
   the default; it stays the escape hatch — an app can `observe` the `CultureService` in its
   root component and `stateHasChanged` cascades anyway.
2. **Auto-observe every injected subscribable service**, not just culture-aware ones: one
   general rule instead of a marker. Tempting (Svelte-shaped), but it changes the meaning of
   *every* store injection — a component that injects a store for a non-rendering purpose would
   re-render on each notification. Recommendation: marker-only in v1; revisit when a second
   case appears (the same reasoning as the `observe` dedup decision: explicit beats magic).

Dev mode warns when a component both injects and explicitly observes the same service (the
existing `observe` double-subscription warning covers it).

---

## 4. Localizable validation messages (R.2)

Today every rule formats .NET's fixed English text inside `validate()`. Two changes, in order:

1. **Built-in messages localize through the localizer.** The rule kinds (`required`, `minLength`,
   `range`, …) map to reserved keys under `tsazor.validation.*` (`tsazor.validation.required`,
   `tsazor.validation.range`, …). Message resolution: look the key up in the app's
   `StringLocalizer` (always registered — an unconfigured one is created with an empty default
   table) with the rule's context as params (`{displayName}`, `{min}`, `{max}`, …); when the key
   is missing, today's fixed English text is the fallback — the default table effectively holds
   it. Overriding `tsazor.validation.required` once localizes every `@Required()` in the app.
2. **Per-rule override, .NET's `ErrorMessage`:**

   ```ts
   @Required({ message: "Pflichtfeld" })                     // fixed string
   @Required({ messageKey: "User.NameRequired" })           // localizer key
   @Range(0, 10, { messageFactory: (ctx) => L.get("Order.Rating", { min: ctx.min, max: ctx.max }) })
   ```

   Three fields, not a polymorphic `message`: `message` (string), `messageKey` and `messageFactory`
   — the context is `{ displayName, …ruleArgs }`. This is a superset: Blazor has `ErrorMessage` and
   `ErrorMessageResourceType`/`ErrorMessageResourceName`; `messageKey` collapses the latter two
   (one resource source — the localizer).

Since `ValidationMessage` renders whatever `EditContext` holds, and field messages re-evaluate
on validation runs, a culture switch must re-validate: `EditContext` observes the localizer the
same way components do (§3) and re-runs validation on notification. That keeps a form's messages
in the new language without a full re-render.

### 4a. The component library's own texts (B29, 2026-10-12)

The skins' texts — a dialog's "Close", the paginator's "Page 2 of 7" and "Rows per page", the grid's
"Loading…" and "No entries", a chip's "Remove Rye", the calendar's "Next month", the screen-reader
announcements of a sortable list — follow the same pattern as the validation messages: each has a
reserved key `tsazor.ui.<name>`, looked up in the app's `StringLocalizer`, with the English text as
the fallback. MudBlazor (`MudLocalizer`) and Fluent UI Blazor (`IFluentLocalizer`) localize theirs
the same way: one service, every instance follows it.

- **The catalog** is `libraryTextDefaults` in `@tsazor/ui` (typed: `LibraryText` is its key union),
  English, with named placeholders (`"paginator.page": "Page {page} of {pages}"`). An app localizes a
  text with one table entry: `"tsazor.ui.paginator.page": "Seite {page} von {pages}"`.
- **Counts** go by the culture's plural rules (`Intl.PluralRules`): a counted text has one entry per
  category — `tsazor.ui.paginator.items.one`, `….other`, and `….few`, `….many` where the language
  has them (Russian, Arabic, …); a missing category falls back to `.other`. `{count}` is written as
  the culture writes numbers ("1.234" in German).
- **Precedence:** a component's own parameter (`emptyText`, `pageSizeLabel`, `buttonLabel`, a
  `labels` object, `ariaLabel`) wins over the table, the table over English. Those parameters are
  optional now: unset means "the library text".
- **Re-render:** a component takes its texts with `libraryTexts()` in a field initializer; that
  resolves the `StringLocalizer` during construction, so a culture change or an arriving table
  re-renders it (§3) — no new mechanism.
- **Silence:** the lookup uses `StringLocalizer.raw`, which doesn't warn about a missing key — the
  library texts are missing from most tables on purpose.
- **Not covered:** the texts an app passes in (labels, titles), and names and formats that come from
  `Intl` for a locale already (month and day names, numbers, dates).

---

## 5. Culture-aware formatting and `@bind:culture`

Blazor parity: `@bind:culture` selects the culture a bind formats and parses with.

- **Numbers:** formatting goes through `Intl.NumberFormat` of the culture (grouping and decimal
  separators per locale). Parsing is the hard part — there is no `Intl` parse — so the parser
  builds its grammar from `Intl.NumberFormat().formatToParts()` (group separator, decimal
  separator, minus sign) and accepts exactly the culture's grammar, like .NET's culture-bound
  `TryParse`: the invariant `1,234.5` fails in de-DE (`,` is not its group separator), and a
  rejected text is `null`, which keeps the model's previous value (the existing NaN guard
  behavior). `@bind:format` composes: the format string stays the invariant token subset
  (`F2`, `#,##0.0`) contributing the digit count, the culture contributes separators and
  grouping. **Scope, decided during implementation:** `@bind:culture` applies to *number* values
  only. A date input's value is ISO by the browser's contract, so a culture there is inert — a
  TZS008 warning, the bind stays invariant; display-side culture date formatting lives on
  `CultureInfo.formatDate` (§1), and date format strings keep the invariant token subset.
- **Invariant by default:** without `@bind:culture` the bind behaves exactly as today (A5/B7) —
  a pure superset.
- **`Decimal` (E12):** *not yet* — `@bind:culture` values are `number` (and the culture argument
  `string | CultureInfo`). When E12's primitives package lands, the plan stands: accept a
  `{ toFixed(digits): string }`-shaped `Decimal` structurally, so money binds culture-aware;
  the runtime stays independent of the primitives package (the X2 `HttpClient`-alias pattern in
  reverse).

Display-side helpers (`formatNumber`/`formatDate` on `CultureInfo`, §1) cover everything outside
binds — `<td>@culture.formatNumber(order.total, { style: "currency", currency: "EUR" })</td>`.

---

## 6. Wiring recipe (documented, not framework code)

The priority chain is app-specific (which URL parameter? whose token response?), so the
framework ships the state machine and the docs a recipe:

```ts
// main.ts
const app = createTsazorApp({
  localization: { defaultCulture: "de-DE", tables },
  services(s) { s.registerValue(CultureSelector, new CultureSelector(...)); },
});

// culture-selector.ts — app code
const params = new URLSearchParams(location.search);
const explicit = params.get("lang") ?? hostLanguageFromPostMessage();
if (explicit) culture.setExplicit(explicit);                    // wins, locks
// when the auth token arrives:
if (!explicit) culture.setFromProfile(token.profile.language);  // ignored if locked
```

Persistence (localStorage, cookie) is deliberately **not** built in — an explicit reload language
usually *should not* survive a `lang=` URL parameter — the recipe shows where an app would add
it. Setting `document.documentElement.lang` on change is in the recipe too (a11y, E9).

---

## 7. Work

- **Runtime (`packages/runtime/src/localization/`):** `CultureInfo`, `CultureService`,
  `StringLocalizer` (fallback chain, async loaders, dev warnings), placeholder formatting;
  `createTsazorApp({ localization })` options + default registrations (an empty
  `StringLocalizer` always exists); auto-render marker + construction-time tracking
  (`withServices`/`inject`); `EditContext` re-validation on culture change; `@bind:culture`
  number/date format & parse in `bind-format.ts`.
- **Compiler:** `@bind:culture` attribute in `codegen.ts` (`emitBind`), composed with
  `@bind:format`.
- **Conformance:** `conformance/test/runtime/localization.test.ts` — fallback chain, lock
  semantics, async table arrival, auto-render on switch, validation message localization,
  culture-aware bind round trip (en-US `1,234.5`, de-DE `1.234,5`), invariant unchanged.
- **Docs:** language reference entries (`CultureInfo`, `StringLocalizer`, `@bind:culture`, the
  auto-render extension), the wiring recipe, the snapshot-trap rule in the patterns doc (E4);
  `getting-started` unchanged (localization is opt-in).
- **Tutorial:** a localization lesson in Part 3 (M4+): table, inject, switch — the re-render
  sells itself in the live preview.
- **`@tsazor/testing`:** a fake culture/localizer pair (like the fake store helper).

## 8. Decisions (2026-10-02)

| # | Question | Decision |
|---|---|---|
| D-L1 | Culture state: `CultureService` DI singleton or static `CultureInfo.current`? | **Service** — no ambient state; `NavigationManager` is the precedent, tests and iframe apps stay isolated |
| D-L2 | Localizer access: `L.get(key, params)` or Blazor's `L["key"]`? | **`get`** — the indexer needs a `Proxy` plus index-signature typing hacks (clean-TS rule) |
| D-L3 | Tables as TS modules or JSON? | **TS modules** (typed keys, async chunks, constants); JSON stays supported |
| D-L4 | Typed placeholders via template-literal types? | **yes** — zero runtime cost, the strict-TS principle applied to text |
| D-L5 | Placeholder syntax: `{name}` (.NET 8 named) or `{{name}}` (i18next, the port's tables)? | **`{name}`** with `{{` as literal — .NET parity; a codemod converts `{{…}}` tables |
| D-L6 | Auto-render scope: culture-aware services only, or every injected subscribable service? | **Culture-aware only in v1** — generalizing changes what every store injection means; revisit on a second case |
| D-L7 | Validation override: `message` (string/factory) + `messageKey` + reserved `tsazor.validation.*` keys, or a separate `ValidationMessageProvider` service? | **The three-message form** — `ErrorMessage` parity, one override per rule; a service is a second thing to wire for the same result |

## 9. Out of scope (v1)

Pluralization (ICU `MessageFormat`) — `Intl.PluralRules` exists, but plural rules need message
syntax the tables then carry; revisit post-1.0 with the extensions packages. Right-to-left
mirroring (CSS `dir`, belongs to `@tsazor/fluent`). TimeZone conversions (`Date` stays local; the
backend converts). `CultureInfo` beyond the locale tag (calendars, `TextInfo`) — no BCL clones.

## 10. Implementation notes (2026-10-02)

Implemented as §1–§5 above, in `packages/runtime/src/localization/` (`culture-info.ts`,
`culture-service.ts`, `string-localizer.ts`), `bind-format.ts`, the DI construction path and the
compiler (`emitBind`). Conformance: `conformance/test/runtime/localization.test.ts` (28 tests).
Deviations and refinements found on the way:

1. **`@bind:culture` is numbers-only** (§5 above): a date input's value is ISO by the browser's
   contract; a culture there warns TZS008 and stays inert. The design's Intl-mapped date
   formatting lives display-side only (`CultureInfo.formatDate`), not in binds.
2. **Parse grammar is strictly the culture's** — .NET parity, not "culture plus invariant" as the
   draft sketched: `parseValue("1,234.5", undefined, "de-DE")` is `null`.
3. **Public shapes are `string`-typed cultures:** `StringLocalizer.culture` returns the culture
   *name*, `all(culture?: string)` takes one — a `CultureInfo` argument would force callers to
   construct one just to pass a tag. `formatValue`/`parseValue` accept `string | CultureInfo`.
   `toCultureInfo` (the internal normalizer) is not on the public index.
4. **Validation resolution order** is `messageFactory` → `message` → `messageKey`/reserved
   `tsazor.validation.<kind>` via the localizer → the built-in English text. The pass
   (`enableDataAnnotationsValidation({ localizer })`) holds the localizer as the *structural*
   `{ raw, subscribe }`, so the forms module carries no localization import.
5. **Auto-render mechanics:** a module-private marker symbol on the service; `withServices`
   collects marked services resolved during component construction, the renderer drains them
   into `autoObserveInternal` (one `observe` each); `ComponentBase.inject` observes a marked
   service only when no collector is active (a lifecycle-time injection). An HMR probe construct
   has no collector and silently ignores marked services.
6. **Typed localizers register via a factory** (see the §2 sketch): the factory resolves the
   shared `CultureService` from the provider; `createTsazorApp` always registers
   `CultureService` (value) and `StringLocalizer` (factory closing over the shared service), and
   a `services` callback may replace either.
7. **Async loader failures warn in dev and serve the fallback chain** (a rejected import is a
   missing table, not a crash — same policy as missing keys).

Since done (from §7): the `@tsazor/testing` fake culture/localizer pair and the Part 3 tutorial lesson. Left for
E12, after 1.0: `Decimal` composing with `@bind:culture`.
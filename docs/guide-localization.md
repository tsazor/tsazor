# Localization

Tsazor's i18n in one file — the agent-facing summary of what exists and how to use it.
Implemented (E8, decided 2026-10-02). The design history and the full wiring recipe:
[design-localization.md](design-localization.md); the framework-text catalog:
[library-texts.md](library-texts.md); the reference section:
[language-reference.md § Localization](language-reference.md#localization-cultureservice-stringlocalizer-bindculture).

Blazor counterpart: `IStringLocalizer` / `CultureInfo` / `@bind:culture`, built on `Intl` —
no BCL clones. The Tsazor extension on top: **injecting a culture-aware service re-renders the
component automatically** (Blazor re-renders nothing on a culture change).

## Setup

`createTsazorApp` always registers `CultureService` (invariant by default) and a
`StringLocalizer` (whose `get` returns the key — an app that never localizes does nothing):

```ts
createTsazorApp({
  localization: {
    defaultCulture: "de-DE",
    tables: {                                       // table value, or an async loader per culture
      "de-DE": () => import("./i18n/de-DE.js"),     // one bundle chunk per culture
      "en-US": enTable,                             // `export default { … } satisfies StringTable`
    },
  },
  // …
});
```

| `LocalizationOptions` | Meaning |
|---|---|
| `defaultCulture` | the fallback culture for missing keys and missing locales; required once `tables` has entries |
| `tables` | culture → table (a record value, or `() => Promise<…>` — `import()` works; the module's `default` export, or the table itself) |
| `documentLanguage` | `<html lang>` follows the texts' language (`ar-SA` → `ar`); default `true`, a screen reader reads the page in its language (WCAG 3.1.1) |

A `services` registration can replace either service.

## Tables

```ts
// i18n/de-DE.ts
export default {
  "Welcome": "Willkommen, {name}!",
  "Orders.Title": "Bestellungen",
} satisfies StringTable;
```

- **TS modules, not JSON, are the recommended form** — the literal export type gives typed keys
  and typed placeholders for free; JSON works too (`resolveJsonModule`).
- **Typed keys** (recommended): parameterize the localizer with the default table's type once, at
  the registration site. `@inject StringLocalizer<typeof de> L` in markup then type-checks every
  key and every placeholder in every consumer — plain TS errors, no extra tooling:

  ```ts
  import de from "./i18n/de-DE.js";
  services.register(StringLocalizer as Token<StringLocalizer<typeof de>>,
    (p) => new StringLocalizer({ culture: p.get(CultureService as Token<CultureService>),
                                 defaultCulture: "de-DE",
                                 tables: { "de-DE": de, "en-US": () => import("./i18n/en-US.js") } }));
  ```

  A factory, not `registerValue` — the factory resolves the *shared* `CultureService` through the
  provider.

```razor
@inject StringLocalizer L            @* or StringLocalizer<typeof de> for typed keys *@

<h1>@L.get("Welcome", { name: user.name })</h1>
```

## The services

| `StringLocalizer<Table>` | |
|---|---|
| `get(key, params?)` | the translation; **not** Blazor's indexer `L["key"]` (bent TS — D-L2) |
| `raw(key)` | the unformatted message or `undefined`, without `get`'s dev warning (for code with its own fallback) |
| `all(culture?)` | the loaded table's entries (Blazor's `GetAllStrings`) |
| `culture` | the current culture *name* (`string`) |

- **Placeholders** are .NET 8's named composite format: `{name}`, and `{{`/`}}` for a literal
  brace. A missing param renders the placeholder unchanged with a dev warning; extra params are
  ignored. **Never `{{name}}`** (i18next style) — that renders `{name}` text.
- **Fallback chain, never a throw:** current culture's table → parent cultures (`de-CH` → `de`)
  → default culture's table → the key itself. A missing key warns in dev mode, is silent in
  production. An async table that hasn't arrived yet serves the fallback until it does; the
  arrival re-renders every injecting component. A failed loader is a missing table (dev warning),
  not a crash.

| `CultureService` | |
|---|---|
| `current` | the current `CultureInfo` |
| `setExplicit(c)` | URL parameter / host postMessage — wins over everything and **locks** `setFromProfile` out for the service's lifetime |
| `setFromProfile(c)` | from the user profile (e.g. the token response); ignored once locked — returns whether it was applied |
| `setDefault(c)` | lowest priority; applies only while nothing stronger is set |
| `subscribe(listener)` | the listener gets a `CultureChangedEventArgs` (`{ previous, current, reason }`); fires only on an actual change |

Setting the same culture again is a no-op. The URL/profile **wiring is app code** (the framework
ships the state machine); the recipe, minus persistence (deliberately not built in — an explicit
reload language usually should not survive a `lang=` URL parameter):

```ts
// main.ts — before or right after createTsazorApp
const explicit = params.get("lang") ?? hostLanguageFromPostMessage();
if (explicit) culture.setExplicit(explicit);                    // wins, locks
// when the auth token arrives:
if (!explicit) culture.setFromProfile(token.profile.language);  // ignored if locked
```

| `CultureInfo` | |
|---|---|
| `name` / `displayName` | the tag as written (`"de-DE"`, `""`) / the culture's own name for itself |
| `CultureInfo.invariant` | name `""`, formatting fixed to `en-US` |
| `formatNumber(value, options?)` / `formatDate(value, options?)` | thin `Intl.NumberFormat`/`DateTimeFormat` wrappers — `<td>@culture.formatNumber(order.total, { style: "currency", currency: "EUR" })</td>` |
| `numberFormatInfo` | the culture's separators and signs (.NET's `NumberFormat`, camelCased) for a numeric input that parses text itself; no currency symbol — format money with `style: "currency"` |

A malformed tag throws at construction.

## Auto-render (the Tsazor extension)

Injecting `CultureService` or `StringLocalizer` subscribes the component automatically — a
culture switch, or an async table's arrival, re-renders every injector. No `observe()` needed or
wanted; explicitly observing an injected culture-aware service gets the double-subscription dev
warning. Escape hatch (rarely needed): `observe` the `CultureService` in the root component and
`stateHasChanged` cascades over the whole tree.

## Validation messages and library texts

- **Built-in validation rules** localize through the reserved keys `tsazor.validation.<kind>`
  (`tsazor.validation.required`, `…range`, `…minLength`, …) with `{displayName}` and the rule's
  params. One table entry localizes every `@Required()` in the app. `<DataAnnotationsValidator />`
  resolves the localizer itself; a culture switch re-validates exactly the fields that hold
  messages. Per-rule override, .NET's `ErrorMessage` parity — resolution order:
  `messageFactory` → `message` → `messageKey` → reserved key → built-in English:

  ```ts
  @Required({ message: "Pflichtfeld" })                      // fixed string
  @MinLength(1, { messageKey: "User.NameRequired" })         // localizer key
  @Range(0, 10, { messageFactory: (ctx) => L.get("Order.Rating", ctx) })
  ```

- **The components' own texts** (a dialog's Close, the paginator's "Page 2 of 7", the grid's
  "Loading…") are the reserved keys `tsazor.ui.<name>`, looked up in the app's `StringLocalizer`
  with `raw` (no warning — they are missing from most tables on purpose). Counting texts have one
  key per `Intl.PluralRules` category (`….one`, `….other`, and `….few`/`….many` where the language
  has them). **Precedence:** a component's own parameter (`emptyText`, `ariaLabel`, …) wins over
  the table, the table over English. The full generated catalog is
  [library-texts.md](library-texts.md); German ships complete:
  ```ts
  import { germanFrameworkTexts } from "@tsazor/ui/texts/de";
  export default { ...germanFrameworkTexts, "Orders.Title": "Bestellungen" } satisfies StringTable;
  ```

## `@bind:culture`

Number and `Decimal` binds only: the value renders and parses through `Intl` with the culture's
separators (de-DE accepts `1.234,5`, not `1,234.5`). On a date bind it warns TZS008 and stays
inert — a date input's value is ISO by the browser's contract; display-side date formatting is
`CultureInfo.formatDate`. Without it everything stays invariant (routing, query strings, data
values, `@bind:format`).

## Testing

`@tsazor/testing` has `createFakeLocalization` — real services, one-line registration:

```ts
const loc = createFakeLocalization({ defaultCulture: "en", tables: { en: { "Save": "Save" }, de: { "Save": "Speichern" } } });
const page = await render(Counter, { services: (s) => loc.register(s) });
loc.switchTo("de");          // explicit: notifies, injected components re-render
expect(page.find("h1").textContent).toBe("Speichern");
```

## Rules for agents

- **Store the key, not the text** (the snapshot trap): stored strings (menu items in data models,
  navigation entries) don't change language on a switch — `{ label: "nav.orders" }`, translated at
  render (`L.get(item.label)`).
- `L.get("key", { param })`, never an indexer, never `{{name}}` (that's the literal-brace escape).
- A table with entries needs `defaultCulture`; missing keys are handled (fallback → key + dev
  warning) — don't add `?? key` logic around `get`.
- Don't persist the selected culture unless the product explicitly wants reload survival — the
  recipe leaves it out on purpose.
- Locale-dependent display formatting goes through `CultureInfo`/`Intl`; data stays invariant.

## Out of scope (post-1.0)

ICU `MessageFormat` pluralization for *app* tables (only the framework texts pluralize today);
RTL mirroring (belongs to `@tsazor/fluent`'s `dir` support); time-zone conversion.

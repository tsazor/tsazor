# Roadmap — Sleipnir integration (`@tsazor/sleipnir`)

Status: **draft, not started** (2026-10-02). Scheduled after the English docs + tutorial work.

Goal: a Tsazor binding for [Sleipnir](https://github.com/HolgerTheHuck/Sleipnir) that is as tight as
`@tsazor/dotnet` is for REST/OpenAPI — typed DTO classes with validation, errors as values,
subscriptions bound to the component lifecycle, connection state and auth as framework services.
Because the Tsazor maintainer also maintains Sleipnir, gaps are fixed **upstream** where they are
not Tsazor-specific; Sleipnir stays framework-neutral (Svelte/JS consumers benefit too).

Baseline: Sleipnir 1.4.3 (`sleipnir-client`, `sleipnir-codegen`, NuGet `Sleipnir.*`), reference
consumer `apps/sleipnir-ticker`.

## Findings (why this is needed)

| Gap | Evidence |
|---|---|
| Codegen ignores `nullable` from discovery — every DTO property is optional | `apps/sleipnir-ticker/src/api/types.ts`, `clients/codegen/src/emitters/ts.ts` |
| Enums collapse to `number` | `clients/codegen/src/core/model.ts` |
| Discovery carries no validation attributes (`[Required]`, `[StringLength]`, `[Range]`, …), no property docs/display names, no event flags (`Resumable`) | `docs/discovery-schema.md` |
| No structured validation errors (`errors: {field: [msgs]}`); validation interceptor is roadmap-only | `ERROR_CATALOG.md`, `ROADMAP.md` |
| No aggregated connection state — only a WS callback and SignalR hooks; router/SSE expose nothing | `clients/ts/src/transport-router.ts`, `sse.ts` |
| Generated event methods take no options (`signal`, `resumePolicy`) | generated `controllers.ts` |
| TS `SleipnirErrorBody` lacks `category`; `PropertyMeta` lacks `navigation` (drift vs. server) | `clients/ts/src/types.ts` |
| Browser WS sends `?access_token=`, server never reads it — authenticated apps must pin `rest` | `guide/chapters/08-auth.md` |
| No user/session convention, no 401 refresh hook | `guide/server/Controllers/AccountController.cs` |
| Subscription bookkeeping is hand-written per app/page | `apps/sleipnir-ticker/src/TickerStore.ts`, `Pages/*.tsazor` |

## Track U — upstream (Sleipnir repo)

- **U1 — Discovery extension** (additive, `discoveryVersion` stays `"1"`): validation attributes on
  properties and parameters (`required`, `minLength`/`maxLength`, `range`, `pattern`, `email`,
  custom message), property documentation + display name, event metadata (`resumable`).
  Authorization stays out of discovery (deliberate: attack-surface oracle, §9).
- **U2 — Validation interceptor**: DataAnnotations on method parameters/DTOs; violations return
  `category: InvalidArgument`, code 400, with a `ValidationProblemDetails`-shaped `errors` map
  (camelCase field paths). Opt-in via `SleipnirOptions`.
- **U3 — Codegen correctness**: honor `nullable` (the four required/nullable combinations as in
  `@tsazor/dotnet`), emit real enums (string-literal union + value map, ints on the wire), event
  methods gain an options parameter (`signal`, `resumePolicy`, `timeout`).
- **U4 — Client**: aggregated connection-state observable on `SleipnirTransportRouter`
  (all backends incl. SSE), `category` in `SleipnirErrorBody`, server reads `access_token` on
  WS upgrade/SSE, optional 401 hook (`onUnauthenticated` → refresh → retry once).

## Track T — `@tsazor/sleipnir`

- **T1 — Emitter** on the `sleipnir-codegen` IR (`buildEmitterInput`, `Resolved*`):
  `tsazor-sleipnir generate --discovery <url|file> --out <dir> [--selfcheck]`. DTO **classes** with
  3.6 validation decorators (from U1), typed controllers/`TypedCall`/`Batch` reused from the
  upstream emitter where possible. Same CLI conventions as `tsazor`/`tsazor-dotnet` (exit 0/1/2,
  selfcheck exit 4 like upstream).
- **T2 — `SleipnirResult<T>`**: discriminated union analogous to `HttpResult<T>`
  (`ok`, `data` | `code`, `category`, `error`, `problem`, `validationErrors`). Bridge
  `applyServerErrors(editContext, result)` writes server validation errors into the
  `ValidationMessageStore` so `ValidationMessage`/`ValidationSummary` show them.
- **T3 — Lifecycle-bound subscriptions**: subscribe from a component, re-render on `onNext`,
  unsubscribe on `dispose()` automatically (AbortSignal from U3); resume policy configurable;
  optional shared (ref-counted) subscriptions for app-wide feeds, replacing hand-written stores.
- **T4 — Connection state** as a service + `CascadingValue` (`SleipnirConnection`), plus a small
  status component.
- **T5 — Auth**: `SleipnirAuthenticationStateProvider` over a configurable "who am I" method
  (default `Account.Me`), bearer/cookie modes, pins `rest` while U4's WS token support is missing.
- **T6 — DI**: `services.addSleipnir(baseUrl, options)` registering client, connection, auth.
- **T7 — Proof**: migrate `apps/sleipnir-ticker` (TickerStore shrinks to state only), add a form
  page exercising client + server validation; E2E + tarball-smoke gates extended.

## Order

1. U3 + U4 (small, low-risk upstream fixes; release Sleipnir 1.5.0-preview)
2. T1–T4, T6 on top (work without U1/U2)
3. U1 + U2, then validation in T1/T2
4. T5, T7

## Open decisions (before starting)

| Question | Recommendation |
|---|---|
| Where does upstream work happen — existing local clone or fresh clone, PRs or direct branch? | ask the maintainer |
| Emitter in `@tsazor/sleipnir` (on the upstream IR) or `--lang tsazor` in `sleipnir-codegen`? | `@tsazor/sleipnir` — keeps Sleipnir framework-free |
| Plan review first or autonomous execution like Phases 2–5? | ask the maintainer |

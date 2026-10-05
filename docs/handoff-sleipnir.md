# Handoff: Sleipnir improvements (track U, upstream)

As of 2026-10-05 (plan reviewed with the maintainer). For the work on the upstream improvements
to [Sleipnir](https://github.com/HolgerTheHuck/Sleipnir). Based on
[roadmap-sleipnir.md](roadmap-sleipnir.md); this document turns it into an actionable task with
findings checked against the upstream code. The Tsazor side (`@tsazor/sleipnir`, track T) follows
in this repo and is context here.

## 1. Ground rules — read first

- **Where:** a **fresh clone** of `HolgerTheHuck/Sleipnir` (`D:\Own\Sleipnir`). One **feature
  branch** and one **pull request on GitHub** per item (U3, U4, U1, U2), reviewed by the
  maintainer. Nothing directly on `main`; merges only with the maintainer's approval.
- **The plan review took place on 2026-10-05** (decisions in §6); work proceeds autonomously.
- **Sleipnir stays framework-neutral.** Nothing Tsazor-specific upstream (no `--lang tsazor`, no
  Tsazor types); the Tsazor emitter lives in `@tsazor/sleipnir`. What lands upstream must help
  Svelte/JS consumers too.
- **The Sleipnir repo has its own `CLAUDE.md`** — read it first; its rules apply there.
- **Compatibility:** every discovery extension is additive, `discoveryVersion` stays `"1"`.
  Existing 1.4.x clients and servers keep working.

## 2. Starting point (checked 2026-10-04)

- Latest version **1.4.3** (tag `v1.4.3`, npm `sleipnir-client`/`sleipnir-codegen`, NuGet
  `Sleipnir.*`). Last change on `main`: 2026-09-08 — the roadmap's findings still hold.
- Reference consumer in Tsazor: `apps/sleipnir-ticker` (ticker API in .NET, synthetic mode for
  deterministic tests; E2E gate in Tsazor's CI).

### Findings, checked against the code — with two corrections to the roadmap

| Finding | Evidence | Status |
|---|---|---|
| **Required/optional missing**: every DTO property becomes `name?: T` | `clients/codegen/src/emitters/ts.ts` `emitTypes` (`${p.wireName}?: ${ty}`) | confirmed |
| **Nullability *is* honored**: `TypeRef.nullable` → `T \| null` | `clients/codegen/src/core/model.ts` `tsTypeOfRef`; `docs/discovery-schema.md` §2 | **correction:** the roadmap said "ignores `nullable`". What is missing is *requiredness* per property — it comes with U1. The emitter's comment ("discovery carries no nullability") is outdated. |
| **Property metadata missing**: `PropertyMeta` has only `PropertyName`, `PropertyType`, `Navigation` | `DISCOVERY_REFERENCE.md` §TypeMeta/PropertyMeta | confirmed; the emitter already writes `documentation` but never gets any. Parameter docs are not wired either (they fall back to the method's, §6). |
| **Enums become numbers** (`long`) | `model.ts` header comment (enum refs collapse to the wire type) | confirmed; `TypeMeta` with `Members` is emitted already — the information is there. |
| **Error category missing in the TS client**: the server has `SleipnirError.Category`, `SleipnirErrorBody` (TS) does not | `SleipnirCommon/Models/SleipnirError.cs`, `clients/ts/src/types.ts` | confirmed (drift) |
| **No aggregated connection state** in `SleipnirTransportRouter` | `clients/ts/src/transport-router.ts` | confirmed (no state observable) |
| Event methods without options (`signal`, `resumePolicy`, `timeout`) | generated `controllers.ts` | from the roadmap, re-check at the start |
| Browser WS sends `?access_token=`, the server does not read it | `guide/chapters/08-auth.md` | from the roadmap, re-check at the start |
| No structured validation errors; validation interceptor only on the roadmap | `ERROR_CATALOG.md`, `ROADMAP.md`, `docs/design/phase-1-interceptor-pipeline.md` | from the roadmap, re-check at the start |

## 3. Order

1. **U3 + U4** (small, low risk) → **Sleipnir 1.5.0-preview** as a local feed (§6.4).
2. **U1 + U2** (discovery extension, validation interceptor) → then U3's required/optional part,
   which needs `required` from U1.

Track T (Tsazor) starts after the preview and works without U1/U2 at first.

## 4. The items

### U3 — codegen correctness (`clients/codegen`)

- **Required/optional:** once U1 delivers `required`, map the four combinations as
  `@tsazor/dotnet` does — required + non-nullable ⇒ `name: T`; required + nullable ⇒
  `name: T | null`; optional ⇒ `name?: T` or `name?: T | null`. Until then: keep the behavior and
  correct the outdated comment ("discovery carries no requiredness") — decision §6.2.
- **Enums:** a real enum identity in the TS output, the wire stays the number — decision §6.1:
  `export const OrderState = { Open: 0, Shipped: 1 } as const;` plus
  `export type OrderState = (typeof OrderState)[keyof typeof OrderState];` — a literal union of
  the numbers, no TS `enum` (tree shaking, `isolatedModules`). Use sites reference the type
  instead of `number`. The other emitters separately (§6.5).
- **Event methods:** an options parameter `{ signal?: AbortSignal; resumePolicy?; timeout? }`;
  `signal` ends the subscription (the basis for Tsazor's lifecycle binding: `observe()`/
  `disposeSignal`).
- **Tests:** extend the codegen snapshot/unit tests; `--selfcheck` (exit 4) stays green.

### U4 — client (`clients/ts`) and server token

- **Connection state:** an observable on `SleipnirTransportRouter` across all backends (WS, SSE,
  SignalR; REST is stateless), e.g. `"connecting" | "open" | "reconnecting" | "closed"` with
  `subscribe(listener) → unsubscribe` (the shape Tsazor's `observe()` and Svelte stores understand).
- **`category`** in `SleipnirErrorBody` (TS) — the server's values from
  `SleipnirCommon/Results/SleipnirErrorCategory.cs`, as a string literal union.
- **Read `access_token` on WS upgrade/SSE on the server** — decision §6.3: only on those
  endpoints, never for ordinary requests; filter the token query from logs. Cookie auth stays the
  recommended way (Tsazor's BFF guide `docs/auth.md`); the query is for bearer scenarios in the
  browser only.
- **401 hook:** optional `onUnauthenticated` → refresh → exactly one retry.

### U1 — discovery extension (server, additive)

- `PropertyMeta` and `ParameterMeta` get: `required`, `minLength`/`maxLength`, `range`
  (`min`/`max`), `pattern`, `email`, a custom error message (`message`), `documentation`,
  `displayName` — from the DataAnnotations (`[Required]`, `[StringLength]`, `[Range]`,
  `[RegularExpression]`, `[EmailAddress]`, `[Display]`) and `[SleipnirDocumentation]`.
- Wire parameter documentation per parameter (today it falls back to the method,
  `DISCOVERY_REFERENCE.md` §6).
- Event metadata: `resumable`.
- **Enum wire form** (found in U3, PR #42): discovery does not say when an enum is serialized as
  a string (`[JsonConverter(typeof(JsonStringEnumConverter))]`, per type or globally). In
  `samples/01-notification-chat` the wire carries `"Inbox"` while discovery lists numeric members,
  so the generated `0 | 1 | 2` type does not match. Add an additive per-enum field (e.g.
  `"wire": "string" | "number"`) and let the TS emitter emit string literals for string enums.
- **Deliberately not:** authorization in discovery (attack-surface oracle, roadmap §9).
- Update `docs/discovery-schema.md` and `DISCOVERY_REFERENCE.md`; tests in
  `SleipnirDiscoveryServiceTests`/`SleipnirDiscoveryTypeRefTests`.

### U2 — validation interceptor (server, opt-in)

- Check DataAnnotations on method parameters and DTOs, opt-in through `SleipnirOptions`.
- Violations ⇒ `Category = InvalidArgument`, code 400, with an `errors` map shaped like
  `ValidationProblemDetails` (camelCase field paths, as on the wire).
- Update `ERROR_CATALOG.md` and the interceptor pipeline docs.

## 5. Gates

- **Sleipnir:** `dotnet test`, the client and codegen tests, `--selfcheck`; the Sleipnir repo's
  existing CI (`.github/`).
- **Consumer:** `apps/sleipnir-ticker` in Tsazor against the preview — packages on
  `1.5.0-preview` from the local feed (npm tarballs `sleipnir-client`/`sleipnir-codegen`, a local
  NuGet source for `Sleipnir.Server`), regenerate the types (`pnpm --filter sleipnir-ticker
  codegen`), `pnpm --filter sleipnir-ticker verify` (synthetic mode) and Tsazor's CI.

## 6. Decisions of the plan review (2026-10-05)

| # | Question | Decision |
|---|---|---|
| 6.1 | Enum representation | **`as const` object + literal union** (no TS `enum`) |
| 6.2 | Required/optional before U1? | **keep everything optional** until U1 delivers `required`; only fix the outdated comment |
| 6.3 | Accept `access_token` in the query? | **yes, narrowly:** WS upgrade and SSE only, filtered from logs; cookies stay the recommended way |
| 6.4 | Release of 1.5.0-preview | **local feed first** (tarballs, local NuGet source) until track T confirms the shape; publish afterwards |
| 6.5 | U3 in the other emitters (`py.ts`, `cs.ts`, `js.ts`)? | **separately**, reasoned in the PR |
| 6.6 | Order within roadmap step 5 | **Sleipnir (tracks U, T) before the remaining Svelte-style features** |

## 7. Afterwards (context, not part of this task)

Track T in Tsazor: T1 emitter on the upstream IR (`tsazor-sleipnir generate`), T2
`SleipnirResult<T>` + `applyServerErrors(editContext, result)`, T3 lifecycle-bound
subscriptions via `observe()`, T4 connection state as a service, T5 auth, T6
`services.addSleipnir(…)`, T7 migrating the ticker app. Details:
[roadmap-sleipnir.md](roadmap-sleipnir.md).

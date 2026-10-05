# Design: `@tsazor/sleipnir` (track T)

Status: proposal (2026-10-05). Roadmap step 5, [roadmap-sleipnir.md](roadmap-sleipnir.md) T1–T7.
Upstream (track U) delivered in Sleipnir 1.5.0-preview: real enums and event options in the
codegen (U3, PR #42), connection state, error category, `onUnauthenticated` and subscription
signals in the client (U4, PR #43). U1 (validation metadata in discovery) and U2 (server
validation errors) follow.

## Goal

Using a Sleipnir backend from Tsazor should feel like `@tsazor/dotnet` does for REST: typed
calls, errors as values, server validation errors in `EditForm`, live data bound to the component
lifecycle, connection state and auth as services — without a hand-written store per app (today:
`apps/sleipnir-ticker/src/TickerStore.ts`).

## Today, in the ticker

```ts
const client = new SleipnirClient(origin, { defaultTransport: "rest" });   // generated
const ticker = await client.call(client.market.getTicker());              // envelope { data, … }
const sub = await client.market.tickerUpdated({ onNext, onError });        // manual bookkeeping
// … the store keeps state, notifies observers, unsubscribes by hand
```

## Proposal

**1. Generation (T1): the upstream client, plus a Tsazor layer.** `tsazor-sleipnir generate
--discovery <url|file> --out <dir>` runs the upstream TypeScript emitter unchanged (controllers,
typed calls, `TypedCall`/`Batch`, transports — no second implementation of the wire) and adds one
file, `tsazor.ts`:

- **Form models** for the types used as method *parameters*: classes with Tsazor's validation
  decorators (`@Required()`, `@StringLength(…)`, …) from U1's metadata, ready for `EditForm`.
  Response types stay the upstream interfaces. Until U1 ships, the classes carry no decorators.
- A typed `addSleipnir` registration for this client (T6, below).

The emitter consumes the upstream IR (`buildEmitterInput`, `Resolved*` from `sleipnir-codegen`),
so naming and wire casing are identical.

**2. Results (T2).** `SleipnirResult<T>` — a discriminated union like `HttpResult<T>`:

```ts
type SleipnirResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: number; category: SleipnirErrorCategory; message: string; validationErrors?: Record<string, string[]> };

const result = await sleipnir(this.Client.order.create(draft));   // never throws for a server error
if (!result.ok) applyServerErrors(this.editContext, result);       // U2's errors map → ValidationMessage
```

Transport failures (offline) are a result with `code: 0`, as in `@tsazor/dotnet`.

**3. Live data (T3).** `live(eventMethod, options)` turns a generated event method into a source
`observe()` understands — `{ value, error, subscribe(listener) }` — subscribed on first use,
unsubscribed through the component's `disposeSignal` (U3's `signal` option):

```tsazor
@inject SleipnirClient Client

<p>@ticker.value?.price</p>

@code {
    ticker = live(this.Client.market.tickerUpdated, { signal: this.disposeSignal });

    override onInitialized() {
        this.observe(this.ticker);
    }
}
```

App-wide feeds use `shared(eventMethod)`: one subscription, reference-counted across components,
ended when the last one is disposed. Resume policy and timeout pass through.

**4. Connection state (T4).** `SleipnirConnection` — a service over the router's `connection`
store (U4): `state` (`"connecting" | "open" | "reconnecting" | "closed"`), observable; plus
`<SleipnirStatus />`, a small badge component.

**5. Auth (T5).** `SleipnirAuthenticationStateProvider` over a configurable "who am I" method
(default `Account.Me`), cookie mode by default (the BFF of [auth.md](auth.md)), bearer with U4's
`onUnauthenticated` refresh hook.

**6. DI (T6).**

```ts
services.addSleipnir(SleipnirClient, { baseUrl: "/", transport: "auto", auth: "cookie" });
// registers the client, SleipnirConnection, and (with auth) the AuthenticationStateProvider
```

**7. Proof (T7).** The ticker drops its store for `shared(…)` + `SleipnirConnection`; a new form
page exercises client and server validation (after U1/U2).

## Decisions to make

- **D-T1 — Generator:** the upstream emitter + a Tsazor layer (`tsazor.ts`), not a full Tsazor
  emitter. **Proposal: yes** — one wire implementation, Tsazor adds forms and DI.
- **D-T2 — Form models:** classes only for parameter types (what forms edit); response types stay
  interfaces. **Proposal: yes.**
- **D-T3 — Results:** a wrapper function `sleipnir(call)` returning `SleipnirResult<T>`, rather
  than changing the generated methods. **Proposal: yes** (the upstream client stays as it is).
- **D-T4 — Live data:** `live` (per component) and `shared` (ref-counted) on top of `observe()`.
  **Proposal: yes.**
- **D-T5 — Package and versions:** `@tsazor/sleipnir` with `sleipnir-client` (and, for the CLI,
  `sleipnir-codegen`) as peer/dev dependencies at `^1.5.0`. Developed on a branch against the local
  1.5.0-preview feed; Sleipnir 1.5.0 is published once this shape is confirmed (decision 6.4), then
  the branch switches to the registry and is merged.

## Order

1. T6 + T4 + T2 (runtime, small) → T3 (`live`/`shared`) → the ticker on them (T7, first half).
2. T1 (generator, form models without validation).
3. After U1/U2 upstream: validation in T1, `applyServerErrors` (T2), the form page (T7).
4. T5 (auth).

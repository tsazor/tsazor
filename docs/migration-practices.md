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
6. **Port the original's tests where they exist.** Blazor's Virtualize suite became Tsazor's parity gate
   (`apps/blazor-parity`). A test that fails only sometimes can be a real race: run it in a loop before you call
   it flaky (A12).

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
- **Generate the clients** with `tsazor-dotnet generate`. Swashbuckle's output needs care: a missing
  `operationId`, missing `required`, multipart bodies and envelopes (F1–F3, F5, F7, F8; all handled now).
- **Calls that throw.** Code ported from NSwag clients expects a throwing call (`catch (ApiClientException)`). Use
  a small `ensureOk(result)` helper (F13).
- **Dates.** `DateTime.ToString()` writes the server's culture (`06.06.2024` on a German machine), and the browser
  can't know it. Run the backend with invariant globalization, or send ISO 8601 (U2). .NET format strings work in
  `@bind:format` (F34).
- **Signing in or out.** `CookieAuthenticationStateProvider` can't be asked again yet. Reload after sign-in, as the
  original redirects (F10, open).

## C# in `@code` becomes TypeScript

- **Lifecycle names.** `OnInitializedAsync` is `onInitialized` returning a Promise. A C#-style
  `onInitializedAsync` gets TZS032 with a rename fix (F14).
- **Narrowing in child content.** `@if (x !== undefined)` doesn't narrow inside child content. Take a local
  `const` (F15).
- **Types in `@code` need an `@import`.** Tags resolve through `@using`, but code is TypeScript (F29).
- **Cascading by type is `instanceof`.** TypeScript has no runtime types, and generated clients return plain JSON,
  never class instances. Cascade such values by name (F30).
- **Value equality.** C# records and `IEquatable` compare by value; TypeScript compares objects by reference.
  Where Blazor relies on equality, give a key: `ItemKey` for rows, `ItemComparer: (a, b) => a.id === b.id` for a
  virtualized provider list. A provider that returns fresh objects otherwise looks like a prepend every time.
- **Cancellation and tasks.** `CancellationToken` is `AbortSignal` (`request.signal`), and `Task` is `Promise`.
  Tsazor keeps Blazor's semantics: a superseded `scrollToItem` resolves, and only the caller's own abort rejects.
- **Enums** stay enums, and `[Flags]` combinations with `|` work (`VirtualizeAnchorMode.Start | End`).
- **Attribute values.** A `"` inside a bare lambda attribute ends the value: write `@(...)` (F23).
- **What just works:**
  - a static through the component's own class name (F19);
  - `@ref="this.x"` (F26);
  - forwarding an unset `EventCallback` (F27);
  - `string | null` bound to a text input (F18).

## Components and libraries

- **Map the component library** (Fluent UI Blazor, MudBlazor) to `@tsazor/fluent` or `@tsazor/bootstrap`. A
  missing component is a finding: the completeness plan ([design-library-completeness.md](design-library-completeness.md))
  closes the gaps before 1.0. Icons are the first wall (F17).
- **Virtualize and QuickGrid** take Blazor 11's parameters.
  - `Items` is an array, and an `ItemsProvider` gets `request.signal`.
  - Rows may differ in height: they are measured.
  - `AnchorMode.End` follows a feed or a chat.
  - The DataGrid passes the same parameters as QuickGrid 11.
- **Await the callbacks you invoke.** Return or await an `EventCallback`'s promise, so an async handler's error
  reaches the `ErrorBoundary` and a test can wait for it (F11, F28).
- **Builder code from data.** `addComponentParameter` (F37). Sequence numbers come from a node's place among its
  siblings (F36).
- **Smaller API shapes:**
  - `Dialog.onClosed` carries no event (F21);
  - breadcrumb items that are state, not URLs, are buttons (F25).

## Tests

- **bUnit becomes `@tsazor/testing`.** `waitUntilIdle` names the work it still waits for (F35). A Virtualize
  renders its rows up to `MaxItemCount`, as with bUnit.
- **A test DOM has no layout.** Put what depends on layout (virtualization, anchoring, scrolling, painted frames)
  in browser tests (Playwright). Run them in all three engines.

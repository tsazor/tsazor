# Design: holding the previous page on navigation (E13)

Status: **done** (2026-10-09). Decided by the owner: on by default, and an app can turn it off. Port
finding F39 ([port-fluentcms.md](port-fluentcms.md)).

## What the owner saw

Switching between Home and Blogs on the FluentCMS port's public site sometimes showed dark flashes
mid-screen, more often when switching quickly. FluentCMS's own UI didn't show them.

The cause was measured on the frames the browser actually paints (a CDP screencast, 40 ms network
latency, 8 navigations):

| | Frames with a dark band mid-screen |
|---|---|
| Tsazor before | 19–23 (77 % of the band dark) |
| Tsazor with the hold | 0 |
| FluentCMS's Blazor UI | 0 |

The plugins load their content in `OnInitializedAsync`, as in FluentCMS. Tsazor renders the new page at
once, so for a few frames the content plugin is empty. The page shrinks to the window's height, and
the template's dark footer moves into the middle of the screen.

## Why Blazor doesn't show it

FluentCMS's public site is static SSR with enhanced navigation. The server renders the whole new page,
data included (without `[StreamRendering]`, SSR waits for every `OnInitializedAsync`). The browser then
swaps the page in one step. In Blazor's interactive render modes the page would show the same empty
state as Tsazor. So this isn't a parity gap in the strict sense. But it is what a Blazor team moving a
public site from SSR to Tsazor sees first. SvelteKit (load functions), React (transitions) and
Angular (resolvers) don't show it either.

## The design

**Hold the previous page on screen until the new one has its data.** In a browser with view
transitions, `NavigationManager` announces `LocationChanged` inside `document.startViewTransition`.
The browser then keeps showing the previous page. The update callback finishes when the app's
renderer has settled and the Router's `OnNavigateAsync` is done, or when the hold's time is up (default
1000 ms). After that the transition is skipped, so the new page shows as it is, without animation.

- **Rendering is unchanged.** Lifecycle methods, render order and DOM updates are the same as
  without the hold. Only what the browser paints is held.
- **The URL changes with the page, a frame later.** Once the browser has captured the previous page,
  `history.pushState`, `navigation.uri` and `LocationChanged` happen together, as without the hold.
  So a check that waits for the URL and then reads the page sees the new page. (A first version
  changed the URL at once and the page a frame later, and the tutorial's gates, which read right
  after `waitForURL`, saw the old page.) In Blazor, too, the URI changes only after the
  location-changing handlers. On back/forward, the browser has already changed the URL. Only
  `LocationChanged` waits.
- **What counts as "ready":** render batches and the async work the renderer tracks that started
  after the navigation. That is lifecycle methods, event handlers, `onAfterRender`, `Await` and
  `renderHandle.track`, plus the Router's `OnNavigateAsync` and a lazy page's chunk when the Router
  has no `<Navigating>`. These don't count:
  - work that was already running before the navigation (a poll loop would otherwise hold every
    navigation);
  - work of components disposed during the hold (a page the user navigated away from).
  
  Data a service loads on its own, outside any of these, doesn't count either. Load it in
  `OnNavigateAsync`, Blazor's hook for "load what the target needs". The port's `ViewState` does
  that now.
- **Navigations during a hold join it.** A navigation while the previous page is still held doesn't
  start a second transition, because that would capture the half-built page. It is announced inside
  the running hold, which then waits for the newest page.
- **Clicks during a hold.** While the update callback runs, the browser doesn't hit-test: a click
  lands on the root element. The NavigationManager notes the visible links and their positions when
  the hold starts. A click on one of them is followed as the click would have been: an in-app link
  through the interception, any other as a click on the link. Measured: Blogs, then Home 100 ms later,
  ends on Home with two history entries, as without the hold. A click on anything else during the
  hold (a button of the page that is going away) has no effect.
- **Errors.** A `LocationChanged` handler that throws is reported as an uncaught error, as from an
  event listener. Before, it propagated out of `navigateTo`.

**Option:** `createTsazorApp({ routing: { holdPreviousPage: 1000 } })` sets the time in ms, and `false`
turns the hold off (every render shows at once, as in Blazor's interactive modes). Without view
transitions in the browser, Tsazor behaves as with `false`. The supported browsers have them (Chromium
111, Safari 18, Firefox 144).

## Alternatives considered

- **Deferring the DOM updates in the renderer** (React's model: the old page stays interactive while
  the new one renders unseen). It gives the best result, but the renderer applies each batch to the
  DOM synchronously, and the frame buffers are reused by the next render. Batches would have to be
  copied and applied later, together with the element references, `onAfterRender` and event-handler
  disposal. That is too much for the benefit before 1.0.
- **Only in the app.** Possible, with the same mechanism in `Program.ts`. But every Tsazor app with
  async data in its pages would need it.
- **Opt-in.** A new app would show the flashes until someone finds the option.

## Interactions

- `@transition`/`@in` on the new page start when it renders, so they may be partly over when the page
  shows. An app that animates page changes turns the hold off and runs its own transition.
- **`<Navigating>` is the app's own waiting state, so it shows.** Without it, Blazor keeps the
  previous page during `OnNavigateAsync`, and the hold extends that to the new page's data. With it,
  the hold doesn't wait for `OnNavigateAsync` and ends once the router shows `<Navigating>`. The
  page that follows then renders as it loads. The tutorial's lesson "Waiting for navigation" shows
  both.

## Tests

- `packages/runtime/test/navigation-hold.test.ts` stands in for the browser's `startViewTransition`.
  It covers:
  - the URL and the page change inside the transition;
  - the hold ends when the new page has its data;
  - earlier work doesn't count;
  - the time limit;
  - `OnNavigateAsync`, and `<Navigating>` shows instead;
  - navigations join the running hold;
  - a click on a held link is followed;
  - `false` and no view transitions;
  - option validation.
- `apps/fluentcms/scripts/verify.mjs` measures the painted frames with 40 ms latency (no dark band
  mid-screen) and the quick second click. With `holdPreviousPage: false`, the first check fails (9 of
  40 frames).

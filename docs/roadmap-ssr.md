# Roadmap — Server-side rendering

Status: **draft, post-1.0** (2026-10-02). Not part of version 1, which targets Blazor parity. The
tutorial ships as a static SPA without SSR.

## Goal and constraints

Tsazor targets public apps with very large audiences (see design-principles "Parity first, then
scale"). That needs fast first paint, SEO and small per-page JavaScript, which SSR provides.

- **TypeScript-first, no .NET dependency.** The renderer is plain TS and runs wherever JS runs
  (Node, Bun, Deno, edge runtimes). TS developers get a complete story without .NET.
- **.NET is one deployment option, not the foundation.** .NET shops use static prerendering
  (no JS runtime in production) or run the SSR service next to their ASP.NET API.
- **API parity with Blazor 8 render modes**: static SSR by default, `@rendermode` per component,
  `[StreamRendering]`, `PersistentComponentState`, enhanced navigation, forms in static SSR. The
  implementation underneath may be better than Blazor's: Blazor re-renders prerendered
  interactive components and replaces their DOM, while Tsazor can **hydrate** (attach to the
  existing DOM) with the same semantics.
- Not planned: `InteractiveServer` (a circuit per user, the very thing that doesn't scale).
  `InteractiveWebAssembly`/`InteractiveAuto` map to client interactivity. Using `InteractiveServer`
  gets a diagnostic with that explanation (documented deviation).

## Stages

### S0 — Prerequisites
- An HTML string applier on top of the edit-list diff (B1), next to the DOM applier.
- The runtime must not touch DOM globals at module load, and the renderer must run without
  `document`.
- Route-level code splitting (lazy route components) in the router and the vite plugin.

### S1 — Static prerendering (SSG) + hydration
- Vite plugin option `prerender` (static routes plus route lists for parameterised ones). It
  writes HTML per route at build time, deployable to any CDN, with any backend.
- Hydration: the client attaches to the prerendered DOM. A mismatch is a dev-mode warning with
  the component path, and falls back to replacing that subtree.
- `PersistentComponentState`: data fetched during prerender is serialized into the page and is
  not fetched again on the client.
- Candidate first consumer: the tutorial (re-deployed prerendered).

### S2 — `@tsazor/server` (streaming SSR)
- A Web-standard handler `render(request: Request): Promise<Response>` that works in Node, Bun,
  Deno and edge runtimes. Thin adapters: `node:http`, Express, Fastify, Hono.
- Dev mode via Vite SSR middleware (HMR keeps working).
- `@rendermode` per component: static by default, interactive components become islands that
  load only their own JS.
- `[StreamRendering]`-equivalent: send the shell immediately, stream slow parts afterwards.
- Request context in DI (cookies, headers, `NavigationManager` on the server), and auth on the
  server through the existing `AuthenticationStateProvider`s.

### S3 — Static-SSR behaviors
- Enhanced navigation (page changes without a full reload, also for static pages).
- `EditForm` in static SSR (`FormName`, `SupplyParameterFromForm`, POST handling) as in Blazor 8.

### S4 — .NET integration
- Templates: the SSR service behind YARP, or as an Aspire resource next to the ASP.NET API.
- `@tsazor/dotnet` clients usable during SSR (server-side fetch, cookie/JWT passthrough).
- **Option: rendering inside the ASP.NET process** (owner, 2026-10-09; post-1.0, to be decided after S2).
  ASP.NET runs no TypeScript, but it can run the compiled JS in an embedded engine: ClearScript
  (Microsoft's V8 binding for .NET, which ReactJS.NET used for React SSR) or Jint (a JS interpreter in
  .NET, slower). One process, as with Blazor, and no Node in production.
  - Cost: native V8 binaries per platform, a pool of engines for parallel requests, and no Node API.
    `fetch` and streams need a bridge into .NET.
  - In return, that bridge can call the ASP.NET endpoints in-process, without HTTP.
  - Microsoft's own Node bridge (`NodeServices`/`SpaServices`) was removed in .NET 5, so it is not an option.

## Gates
- Hydration conformance suite: for every conformance component, the SSR output hydrates
  without a mismatch, and its behavior after hydration equals a client-only render.
- Benchmarks against React (Next) and Svelte (SvelteKit) SSR: TTFB, LCP, JS bytes per page,
  time-to-interactive. Results go into the README only once they're measured.

## Decisions (2026-10-02)
| Question | Decision |
|---|---|
| Hydration: real attach or Blazor-style replace? | **Attach**, replace only as the mismatch fallback |
| Default for interactive pages: whole-page hydration or islands? | **Islands** (static by default, as Blazor 8) |
| Where does S2 run in the reference deployment? | **Node**; Bun/edge covered by the Web-standard handler |

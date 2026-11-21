# fullstackhero admin on Tsazor

fullstackhero's operator console — a React 19 app on Radix, Tailwind v4 and TanStack Query
([fullstackhero/dotnet-starter-kit](https://github.com/fullstackhero/dotnet-starter-kit), `clients/admin`) — ported
to Tsazor, against fullstackhero's unchanged .NET 10 API. The look is the original's: its `globals.css`, its Tailwind
classes, its shadcn-style components as Tsazor components on `@tsazor/ui`. Why, how and what the port found:
[docs/port-fullstackhero.md](../../docs/port-fullstackhero.md).

```bash
pnpm --filter fullstackhero dev           # http://localhost:5372 (the API through the proxy: :5030)
pnpm --filter fullstackhero backend       # the upstream backend via .NET Aspire (needs Docker)
pnpm --filter fullstackhero acceptance    # the original's Playwright suite against the port (API mocked)
pnpm --filter fullstackhero visual        # the same suite against both apps, screenshots compared
```

The first run clones the upstream repository into `.backend/` (git-ignored) at the pinned commit; the original's
public files (`/config.json`, the logo) come from there.

## Licence

The ported code is derived from fullstackhero (MIT, © 2021–2026 fullstackhero); its licence is in
[LICENSE.fullstackhero](LICENSE.fullstackhero). The files under `src/api`, `src/auth/{api,inactivity,jwt,token-store}.ts`,
`src/lib/{api-client,api-types,cn,permissions,query-client}.ts`, `src/env.ts`, `src/styles/globals.css`,
`src/pages/login.demo-accounts.ts` and `src/components/layout/nav-items.ts` are the original's, unchanged or with
one import changed.

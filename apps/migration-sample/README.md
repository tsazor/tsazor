# Migration sample: Blazor Server and Tsazor side by side

The reference setup for an incremental migration (roadmap E6, guide: [docs/migration.md](../../docs/migration.md)).
An existing **Blazor Server** app keeps running; pages move to Tsazor one route at a time. A
**YARP gateway** puts both under one origin, so they share the sign-in cookie and the user never
notices which part serves a page.

```text
browser ──► Gateway :5410 (YARP)
              ├─ /orders, /orders/**   → the Tsazor build (index.html; assets under /tsazor/)
              └─ everything else       → Legacy :5411 (Blazor Server: pages, /_blazor, /api, /auth)
```

| Part | What it shows |
| --- | --- |
| `Legacy/` | The Blazor Server app: in-process `OrderService`, cookie sign-in, and the **API boundary** drawn for the migration (`/api/orders` over the same service, `RequireAuthorization`), plus `/auth/user` for the Tsazor side ([docs/auth.md](../../docs/auth.md)). Its old `Orders.razor` stays — remove the route from the gateway and it serves again. |
| `Gateway/` | YARP: the migrated routes (`Tsazor:Routes` in `appsettings.json`) get the Tsazor build, everything else goes to the Blazor app, including its WebSocket. |
| `src/` | The migrated pages (`/orders`, `/orders/{id}`), the same header and stylesheet as the Blazor app, `CookieAuthenticationStateProvider` for the shared session, `LeaveApp` for links to pages Tsazor does not serve. |

Links between the parts are full page loads: `target="_top"` on links to the other side (neither
Blazor nor Tsazor intercepts them). A Tsazor `NotFound` hands the URL back to the gateway once.

## Run it

```sh
pnpm --filter migration-sample build      # the Tsazor pages → dist/
dotnet run --project apps/migration-sample/Legacy
dotnet run --project apps/migration-sample/Gateway
# open http://localhost:5410
```

`pnpm --filter migration-sample verify` builds everything, starts both servers and walks through
the flows in a browser (CI runs it).

## Migrating the next page

1. Draw its API boundary in the Blazor app (endpoints over the services the page uses).
2. Build the page in Tsazor (`src/Pages/…`, the codemod gives the markup a head start).
3. Add its route to `Tsazor:Routes` in `Gateway/appsettings.json`; mark links to it `target="_top"`.
4. When it has proven itself, delete the Blazor page.

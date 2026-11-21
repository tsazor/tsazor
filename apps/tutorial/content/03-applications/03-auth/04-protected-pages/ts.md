---
title: Protected pages
keywords: @authorize, AuthorizeRouteView, protected pages, redirect
focus: Orders.tsazor
gate: click .staff a
---

Customers no longer see the Orders link. But the page is still there: the home page has a
staff link to it, and anybody can type `/orders` into the address bar. Click "today's
orders" without signing in — the list shows up. Hiding a link doesn't protect a page.

Protect the page itself. Add this line below `@page` in `Orders.tsazor`:

```tsazor
@authorize({ roles: ["baker"] })
```

A bare `@authorize` means "signed-in users only"; with `roles` (or `policy`) the user also
needs one of the roles.

The router has to check this before it renders the page. In `App.tsazor`, replace
`RouteView` with `AuthorizeRouteView` and tell it what to show when access is denied:

```tsazor
<AuthorizeRouteView RouteData="@routeData">
    <NotAuthorized>
        <p class="denied">Bakers only — please sign in as a baker.</p>
    </NotAuthorized>
</AuthorizeRouteView>
```

Click "today's orders" again: "Bakers only". Sign in as Marta: still denied. Sign out and in
as baker, and the list appears right away — `AuthorizeRouteView` updates when the user
changes.

One thing to keep in mind: all of this runs in the browser, and anything in the browser can
be changed by the user. `@authorize` and `AuthorizeView` decide what the UI *shows*. The
order data itself must come from a server that checks the user on every request.

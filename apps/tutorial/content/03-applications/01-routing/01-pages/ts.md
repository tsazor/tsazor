---
title: Pages
keywords: @page, Router, routing, RouteView, pages
focus: App.tsazor
gate: click nav a:nth-child(2)
---

The bakery app has two pages, `Home` and `About`, but `App.tsazor` always shows `<Home />`.
Click About: nothing happens. Let's make the URL decide which page is on screen.

First, each page declares its own route with `@page` at the top. Give `Home.tsazor` the
route `/` and `About.tsazor` the route `/about`:

```tsazor
@page "/about"
<h2>About the bakery</h2>
```

Then replace the hard-coded `<Home />` in `App.tsazor` with a `Router`:

```tsazor
<Router>
    <Found Context="routeData">
        <RouteView RouteData="@routeData" />
    </Found>
    <NotFound>
        <p>Nothing here.</p>
    </NotFound>
</Router>
```

Click About again. The URL changes, the `Router` finds the page whose `@page` matches, hands
the result to `Found` as `routeData` (you pick that name with `Context`), and `RouteView`
renders the page. When nothing matches, `NotFound` renders instead.

Nothing reloads, either: plain `<a>` links that stay inside the app become in-app
navigation. You don't register routes anywhere — the build collects every `@page` in the
app for you.

The preview runs in a sandboxed frame, so the URL you see in its bar lives in an in-memory
history. In your own app it's the browser's address bar.

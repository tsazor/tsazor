---
title: Pages
focus: App.tsazor
gate: click nav a:nth-child(2)
---

The bakery has two pages: `Home` and `About`. But `App.tsazor` shows `<Home />` and
only that — the About link points at `#`, and clicking it changes nothing.

Real apps have many pages, and which one is on screen follows the URL. A page
declares its own route with `@page` at the top:

```tsazor
@page "/about"
<h2>About the bakery</h2>
```

Give `Home` the route `/` and `About` the route `/about`, then swap the hard-coded
`<Home />` in `App.tsazor` for a `Router`:

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

The `Router` looks at the current URL and picks the page whose `@page` matches. The
match lands in `routeData`, and `RouteView` renders that page. No match? The
`NotFound` fragment runs instead. The `Context` name is yours — the router hands
its result to whatever you called it.

Where do the routes come from? The build reads every `@page` in the app and collects
them into a route manifest, which the router receives at startup. A page is an
ordinary component with a route attached — the URL decides whether it renders.

Click About. The URL changes (watch the preview bar — the preview runs the app in a
sandboxed frame, so the URL lives in an in-memory history; in your own app it's the
browser's real one), the router matches `/about`, and the About page appears.
Nothing reloaded: plain `<a>` links that stay within the app are intercepted and
become in-app navigation.
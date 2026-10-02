---
title: Pages
focus: App.tsazor
gate: click nav a:nth-child(2)
---

`App.tsazor` currently hard-codes `<Home />`; the About link goes nowhere. Time for
routing — and the model is Blazor's: a `@page` at the top of a component, a `Router`
with `Found`/`NotFound`, and `RouteView`.

Put `@page "/"` on `Home.tsazor` and `@page "/about"` on `About.tsazor`, then replace
the `<Home />` in `App.tsazor`:

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

The `Router` matches the current URL against the `@page` templates, `RouteView`
renders the winning component, `NotFound` runs when nothing matches. Clicking About
changes the URL and renders the About page — no reload, because same-origin anchors
are intercepted, the same idea as Blazor's enhanced navigation.

> **Coming from Blazor:** this is your `Routes.razor`, minus the `AppAssembly`
> attribute. Blazor reflects over the assembly at runtime to find `@page` components;
> here the build collects every `@page` template into a route manifest up front (a
> virtual module in a real app), so the `Router` takes no parameters. `routeData`
> is the `RouteData` you know, `RouteView` also applies the layout, and the preview
> bar's URL comes from an in-memory history — the preview is a sandboxed frame; a
> real app writes to the browser's history.
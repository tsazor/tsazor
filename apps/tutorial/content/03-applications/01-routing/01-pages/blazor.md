---
title: Pages
focus: App.tsazor
gate: click nav a:nth-child(2)
---

Routing works the way you know it from Blazor: `@page` on a component, a `Router` with
`Found` and `NotFound`, and `RouteView`.

Right now `App.tsazor` hard-codes `<Home />`, so the About link goes nowhere. Put
`@page "/"` on `Home.tsazor` and `@page "/about"` on `About.tsazor`, then replace the
`<Home />`:

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

Click About: the URL changes and the About page renders, without a reload. Links that stay
inside the app are intercepted, much like Blazor's enhanced navigation.

> **Coming from Blazor:** this is your `Routes.razor` without `AppAssembly`. Instead of
> reflecting over an assembly at runtime, the build collects every `@page` up front, so the
> `Router` takes no parameters. The preview's URL bar shows an in-memory history because the
> preview runs in a sandboxed frame.

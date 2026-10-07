---
title: A component library
keywords: component library, @tsazor/bootstrap, @tsazor/fluent, Button, Card, intent, appearance, MudBlazor
focus: App.tsazor
---

The card's buttons are styled by hand. Bring in the component library — `@using`, as in Razor:

```tsazor
@using @tsazor/bootstrap
```

and replace the markup:

```tsazor
<Card>
    <CardBody>
        <CardTitle>Order 101</CardTitle>
        <p>Two sourdough loaves and one rye, for Marta, tomorrow at 7.</p>
        <Button Intent="primary" OnClick="save">Save</Button>
        <Button Intent="secondary" Appearance="outline" OnClick="cancel">Cancel</Button>
        <p class="status">@status</p>
    </CardBody>
</Card>
```

Then drop the hand-written rules from `App.tsazor.css`.

> **Coming from Blazor:** this is your MudBlazor, Radzen or Fluent UI Blazor. Tsazor ships two skins
> with the same components and parameters — `@tsazor/bootstrap` and `@tsazor/fluent` — so switching
> is the `@using` line and the stylesheet. Parameters are typed literal unions: `Intent="primary"`,
> `Appearance="outline"`, `Size="small"`, with completion in the editor. In an app, `npm install
> @tsazor/bootstrap bootstrap` and import the stylesheet in `Program.ts`.

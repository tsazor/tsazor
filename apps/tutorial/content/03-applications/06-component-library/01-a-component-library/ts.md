---
title: A component library
keywords: component library, @tsazor/bootstrap, @tsazor/fluent, Button, Card, intent, appearance
focus: App.tsazor
---

The order card works, but every button and border is styled by hand in `App.tsazor.css`, and the
next page would need the same rules again. A component library brings them ready-made: buttons,
cards, forms, dialogs, a data grid.

Tsazor has two, with the same components and parameters: `@tsazor/bootstrap` (the Bootstrap 5 look)
and `@tsazor/fluent` (Microsoft's Fluent 2). This lesson uses Bootstrap. Make its components
available in the file, at the top of `App.tsazor`:

```tsazor
@using @tsazor/bootstrap
```

Now replace the card and the two buttons:

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

and delete the button and card rules from `App.tsazor.css`. `Intent` is the button's role —
`primary`, `secondary`, `success`, `danger`, `warning`, `info` or `neutral` — and `Appearance` its
weight: `solid` (the default), `outline`, `subtle` or `transparent`. `Size` takes `small`,
`medium` or `large`. Try `Intent="danger"` on Save.

> **Tsazor chooses one core, two skins.** The behavior — focus, keyboard, ARIA — lives once in
> `@tsazor/ui`; Bootstrap and Fluent are two looks on top with the same names and parameters. A
> page moves from one to the other by its `@using` line and the stylesheet. You can still write
> Bootstrap's classes on plain elements (`<button class="btn btn-primary">`); the components add
> what classes can't, such as a dialog's focus handling.

In your own app, install the package and its stylesheet (`npm install @tsazor/bootstrap
bootstrap`) and import the CSS once in `Program.ts`: `import "bootstrap/dist/css/bootstrap.min.css";`.
The preview here does that for you. Put `@using @tsazor/bootstrap` in `_Imports.tsazor` to have the
components in every file.

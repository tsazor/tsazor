---
title: A component library
keywords: component library, @tsazor/bootstrap, @tsazor/fluent, Button, Card, intent, appearance
focus: App.tsazor
---

The order card works, but every button and border is styled by hand in `App.tsazor.css`, and the
next page would need the same rules again. A component library brings them ready-made: buttons,
cards, forms, dialogs, a data grid.

A library is an option, not a part of Tsazor. Everything so far worked without one — plain
elements and your own CSS, vanilla Tsazor — and that stays a fine way to build an app. A library
is an npm package of components like the ones you write yourself; any library built for Tsazor
plugs in the same way. This chapter uses `@tsazor/bootstrap` (the Bootstrap 5 look) as the
example; `@tsazor/fluent` (Microsoft's Fluent 2) has the same components and parameters. Make the
library's components available in the file, at the top of `App.tsazor`:

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

> **Tsazor chooses to leave the library to you.** Nothing in the framework depends on one: a library
> uses the same public building blocks your own components do, and `@tsazor/ui` offers the hard parts
> — focus, keyboard, ARIA — to anyone writing one. The Bootstrap and Fluent libraries are two
> examples built on it, with the same names and parameters, so a page moves between them by its
> `@using` line and the stylesheet. You can also write Bootstrap's classes on plain elements
> (`<button class="btn btn-primary">`); the components add what classes can't, such as a dialog's
> focus handling.

In your own app, install the package and its stylesheet (`npm install @tsazor/bootstrap
bootstrap`) and import the CSS once in `Program.ts`: `import "bootstrap/dist/css/bootstrap.min.css";`.
The preview here does that for you. Put `@using @tsazor/bootstrap` in `_Imports.tsazor` to have the
components in every file.

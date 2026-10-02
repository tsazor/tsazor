---
title: Your first component
focus: App.tsazor
---

Tsazor apps are built from **components**. A component is a self-contained, reusable piece of
UI: markup, behavior and (optionally) styles. Each component lives in a `.tsazor` file, and
the file name is the component name — the file on the right defines `App`.

Right now `App` is just markup. Let's give it some data. Add a `@code` block at the bottom of
the file and declare a field in it:

```tsazor
<h1>Hello world!</h1>

@code {
    name = "Tsazor";
}
```

The contents of `@code` are the body of a TypeScript class — the component class. Fields are
its state, methods its behavior.

Now use the field in the markup. An `@` switches from markup to code:

```tsazor
<h1>Hello @name!</h1>
```

The preview updates as you type.

Notice that the template says `@name`, not `@this.name`: names in markup refer to members of
the component. Inside `@code` it's ordinary TypeScript, so there you'll write `this.name`.

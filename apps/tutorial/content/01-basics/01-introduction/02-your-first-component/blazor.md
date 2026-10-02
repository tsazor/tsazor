---
title: Your first component
focus: App.tsazor
---

A Tsazor app is built from components, just like a Blazor app. The file on the right,
`App.tsazor`, is one: a template with no code yet. As in Blazor, the file name is the
component name — this one is `App`.

Static markup is a bit boring, so let's add some data. Add a `@code` block at the bottom
and declare a field:

```tsazor
<h1>Hello world!</h1>

@code {
    name = "Tsazor";
}
```

Now use it in the markup:

```tsazor
<h1>Hello @name!</h1>
```

The preview updates as you type.

> **Coming from Blazor:** the `@code` block holds a TypeScript class body, so a field is
> written `name = "Tsazor";` — no `string` in front, and no `private` needed (you can add
> either, as `private name: string = "Tsazor";`, if you like). In the markup you write
> `@name` just as in Razor. Inside `@code`, though, members are plain TypeScript class
> members — there you'll always write `this.name`.

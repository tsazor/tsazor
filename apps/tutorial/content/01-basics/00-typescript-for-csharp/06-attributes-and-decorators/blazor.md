---
title: Attributes and decorators
focus: calculator.ts
---

Where C# has attributes, TypeScript has **decorators**, and Tsazor uses them wherever
Blazor uses attributes:

| C# | Tsazor |
| --- | --- |
| `[Parameter] public string Title { get; set; }` | `@Parameter() title = "";` |
| `[CascadingParameter]` | `@CascadingParameter()` |
| `[Required, StringLength(80)]` | `@Required() @StringLength(80)` |

They look alike, but they work differently. An attribute is passive metadata; nothing
happens until someone reads it through reflection. A decorator is a **function** that runs
once, when the class is defined, and may *replace* what it decorates. `log.ts` has one,
`logged`, which wraps a method so every call lands in a log. Apply it:

```ts
export class Calculator {
    @logged
    add(a: number, b: number): number {
        return a + b;
    }

    @logged
    multiply(a: number, b: number): number {
        return a * b;
    }
}
```

The call log fills up. Look at `logged` itself: it receives the original method plus a
`context` (name, kind, a metadata bag) and returns the replacement. It's an AOP interceptor
in a dozen lines, no proxy library needed. `@Parameter()` works the same way: it records the
field in the class's metadata, where the renderer finds it.

> **Coming from C#:** decorators apply to classes and their members (methods, fields,
> getters, setters) only, not to parameters, interfaces or free functions. Tsazor uses the
> **standard** decorators of current TypeScript and JavaScript, not the older
> `experimentalDecorators` you may know from Angular; keep that flag out of your
> `tsconfig.json`. Note the parentheses: `@Parameter()` calls a function that returns the
> decorator, like an attribute constructor; `@logged` *is* the decorator.

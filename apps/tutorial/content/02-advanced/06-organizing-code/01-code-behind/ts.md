---
title: Code-behind
focus: Password.tsazor
refactor: true
---

`Password.tsazor` is a dozen lines of markup and three times as much code. Scrolling past rules
and getters to find the markup gets old, and the code would be nicer in a plain `.ts` file —
with every TypeScript tool working on it as usual.

A component can keep its code in a second file next to it: `Password.tsazor.ts`, the
*code-behind*. It's a class that default-exports, extends `ComponentBase`, and holds the state
and logic. The markup file's generated class extends it, so everything the markup refers to is
found there. The file is already in place, empty. Move the whole `@code` block into it:

```ts
import { ComponentBase, Parameter } from "@tsazor/runtime";

export default class PasswordBase extends ComponentBase {
    @Parameter() minLength = 10;

    password = "hunter2";

    private get rules() { /* … */ }

    protected get score(): number { /* … */ }
    protected get hints(): string[] { /* … */ }
    protected get level(): "weak" | "fair" | "strong" { /* … */ }
    protected get verdict(): string { /* … */ }
}
```

and delete `@code` from `Password.tsazor`. The preview doesn't change — that's the point.

It's a normal TypeScript module, so it imports what it uses (`Parameter` here). And it's a
*base class* of the markup, which has one consequence for visibility: what the markup reads must
be `protected` or public. A `private` member is visible only inside the code-behind class itself
— make `score` private and `tsazor check` reports *Property 'score' is private and only
accessible within class 'PasswordBase'.* `rules` is only used by the getters, so it stays
private.

**When to split.** Keep small components in one file — markup and a few fields read best
together. Move to a code-behind when the code outweighs the markup, when it has logic worth
reading (or testing) on its own, or when a designer edits the markup and a developer the code.
And if the logic doesn't need the component at all — a pure calculation — it belongs in neither
file; the next lessons get there.

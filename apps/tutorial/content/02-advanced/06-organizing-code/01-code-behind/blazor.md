---
title: Code-behind
focus: Password.tsazor
refactor: true
---

Code-behind files, as `X.razor.cs` — except that TypeScript has no partial classes, so the
pairing works through inheritance: `Password.tsazor.ts` default-exports a class extending
`ComponentBase`, and the class generated from `Password.tsazor` extends *that*.

Move the `@code` block into `Password.tsazor.ts` (it's there, empty) and delete it from the
markup. The preview stays the same.

```ts
import { ComponentBase, Parameter } from "@tsazor/runtime";

export default class PasswordBase extends ComponentBase {
    @Parameter() minLength = 10;
    password = "hunter2";
    private get rules() { /* … */ }
    protected get score(): number { /* … */ }
    // …
}
```

> **Coming from Blazor:** a partial class shares `private` members with the markup; a base
> class doesn't. Members the markup uses must be `protected` or public — a `private` one is
> TS2341 in `tsazor check` (*Property 'score' is private and only accessible within class
> 'PasswordBase'*). The code-behind is a plain module: it imports `ComponentBase`, `Parameter`
> and friends itself, there's no `_Imports` for `.ts` files. `@inherits` moves into the
> code-behind's `extends` (a `.tsazor` with both gets warning TZS011, the code-behind wins).
> `@code` can still exist next to it — both merge, `@code` being the derived class. The class
> name in the file doesn't matter; the default export does.

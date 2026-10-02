---
title: Attaching a file
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

Some orders need a picture — the customer's dream loaf, sketched or photographed,
so the baker knows what "a swirl like this" means. `InputFile` is the last of
the form family — the tag auto-imports like every component, but the event's
argument type is code, so it needs the import:

```ts
@import { InputFileChangeEventArgs } from "@tsazor/runtime"
```

Then it is an input like any other, with the usual pass-through attributes —
`accept` limits what the picker offers:

```tsazor
<label>Picture<InputFile OnChange="handlePicture" accept="image/*" /></label>
```

No `@bind` here — a file is not a string you type. The event hands your handler
an `InputFileChangeEventArgs`, and `.file` is the browser's `File` object:

```ts
picture: File | null = null;

handlePicture(args: InputFileChangeEventArgs) {
    this.picture = args.file;
}
```

A `File` knows its `name`, its `size` in bytes, its `type` — and how to read
its bytes (`text()`, `arrayBuffer()`), all without leaving the browser. Show
what was chosen:

```tsazor
<p>@(picture === null ? "No picture chosen." : `${picture.name} (${picture.size} bytes)`)</p>
```

`.file` is for single-file inputs; with a `multiple` attribute the input holds
several files, and `args.getMultipleFiles(10)` returns them — at most ten, or
the pick throws, a guard against someone emptying their photo library into
your bakery.

That closes the form: a model with rules on its fields, inputs bound to those
fields, messages next to them, a summary at the top, styles in the fields, a
rule with today's context, and a picture for the baker. One honest gap remains:
the reserve goes to a `submitted` flag, not to a bakery. That is the next
chapter's story.
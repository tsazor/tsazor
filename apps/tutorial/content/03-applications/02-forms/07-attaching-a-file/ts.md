---
title: Attaching a file
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

Some customers want a special loaf and would like to send a picture of it. Add a file input
to the form, below the checkbox:

```tsazor
<label>Picture<InputFile OnChange="handlePicture" accept="image/*" /></label>
```

There's no `@bind` this time — you don't type a file. Instead, `OnChange` calls your handler
when the user picks one. `accept` is passed on to the `<input>` and limits the picker to
images.

The handler receives an `InputFileChangeEventArgs`, and its `file` is the browser's own
`File` object. Keep it in a field:

```ts
picture: File | null = null;

handlePicture(args: InputFileChangeEventArgs) {
    this.picture = args.file;
}
```

`InputFileChangeEventArgs` is a type you use in code, so add it to the import at the top:

```tsazor
@import { EditContext, InputFileChangeEventArgs, ModelValidator } from "@tsazor/runtime"
```

Show what was picked, below the input:

```tsazor
<p>@(picture === null ? "No picture chosen." : `${picture.name} (${picture.size} bytes)`)</p>
```

Choose an image, and its name and size appear. A `File` can also read its contents with
`text()` or `arrayBuffer()`, right in the browser.

To allow several files, add a `multiple` attribute and read them with
`args.getMultipleFiles(10)`. The number is a limit: if the user picks more, it throws.

The form is complete. It still doesn't send the order anywhere — that's the next chapter.

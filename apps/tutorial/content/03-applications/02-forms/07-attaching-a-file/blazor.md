---
title: Attaching a file
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

Customers can attach a picture of their dream loaf. Add an `InputFile` below the checkbox and
keep the picked file in a field:

```tsazor
<label>Picture<InputFile OnChange="handlePicture" accept="image/*" /></label>
<p>@(picture === null ? "No picture chosen." : `${picture.name} (${picture.size} bytes)`)</p>
```

```ts
picture: File | null = null;

handlePicture(args: InputFileChangeEventArgs) {
    this.picture = args.file;
}
```

Add `InputFileChangeEventArgs` to the `@import` from `@tsazor/runtime`, then choose an image.

> **Coming from Blazor:** same component, same `OnChange`, but no `IBrowserFile` and no
> `OpenReadStream`. `args.file` is the browser's `File`, and `text()` or `arrayBuffer()`
> read it directly. `getMultipleFiles(10)` is your `GetMultipleFiles(10)` and throws with
> Blazor's message when there are more files.

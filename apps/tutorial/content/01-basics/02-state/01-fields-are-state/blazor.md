---
title: Fields are state
keywords: state, fields, @onclick, re-render
focus: App.tsazor
gate: click button
---

Time to make things interactive — with the model you know: state lives in the component's
fields, and an event handler that changes a field causes a re-render.

The button on the right already calls `increment` (`@onclick="increment"`, a method group,
exactly as in Razor). Fill in the method:

```tsazor
increment() {
    this.count++;
}
```

Click the button. As in Blazor, the component renders again after the handler ran, the new
render tree is diffed against the previous one, and only the changed text node is touched.

> **Coming from Blazor:** the counter you know from the project template, in TypeScript.
> `private int currentCount = 0;` becomes `count = 0;` (the type is inferred; write
> `count: number = 0` if you prefer), and `void IncrementCount()` becomes
> `increment() { … }`. Inside `@code` every member access needs `this.` — TypeScript has no
> implicit `this`. In the markup you still write `@count` and `@onclick="increment"`; the
> compiler adds the `this.` for you.

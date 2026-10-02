---
title: Sections
focus: EditorPage.tsazor
---

Blazor's sections (.NET 8), with the same semantics. `App` has an outlet in its top bar:

```tsazor
<SectionOutlet SectionName="actions" />
```

Move the page's buttons into it:

```tsazor
<SectionContent SectionName="actions">
    <button @onclick="save">Save</button>
    <button @onclick="discard">Discard</button>
</SectionContent>
```

As in Blazor: the most recently rendered provider wins and the outlet falls back to the previous
one when it's removed; a provider renders nothing in its own place; a second outlet for the same
identifier throws Blazor's error; `SectionId` (an object) works instead of `SectionName`, and
setting both or neither is an error.

> **Coming from Blazor:** `SectionId="@MyLayout.TopbarSection"` with a
> `public static SectionOutlet.SectionId`-style field becomes any object you export — for
> example `export const topbar = {}` in a module, imported where it's used. Content keeps the
> context of the component that provides it (its handlers, its re-renders), exactly like
> `RenderFragment`s in Blazor.

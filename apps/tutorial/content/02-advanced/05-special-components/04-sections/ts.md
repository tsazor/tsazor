---
title: Sections
focus: EditorPage.tsazor
---

`App` is the frame of the app: a top bar, and the page below it. The page's **Save** and
**Discard** buttons would look best in that top bar — but the bar belongs to `App`, and the
buttons, their handlers and their state belong to the page. Which component should own them?

Both, in a way. `App` already has a hole in its bar:

```tsazor
<SectionOutlet SectionName="actions" />
```

and the page can fill it from where it is:

```tsazor
<SectionContent SectionName="actions">
    <button @onclick="save">Save</button>
    <button @onclick="discard">Discard</button>
</SectionContent>
```

Replace the page's `<p class="page-actions">` with that. The buttons appear in the top bar, and
they're still the page's: `save` and `discard` run on `EditorPage`, its state re-renders them.
`SectionContent` renders nothing where it's written; its content shows up at the outlet with the
same name.

The rules:

- If several components provide content for the same section, the most recently rendered one
  wins; when it goes away, the previous one comes back. So a dialog can take over the toolbar
  while it's open.
- When the providing component is removed, its content leaves the outlet.
- Without an outlet, the content goes nowhere — and there can only be one outlet per name.

Sections are how layouts let pages contribute a toolbar, breadcrumbs or a sidebar without the
layout knowing about every page — handy once an app has layouts and routes (Part 3).

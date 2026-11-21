---
title: Attribute splatting
keywords: attribute splatting, @attributes, CaptureUnmatchedValues
focus: App.tsazor
gate: click button
---

`FancyButton` wraps a `<button>` with some styling. For it to be useful, the button inside
should accept the attributes you'd give any button — a `title`, `disabled`, an `aria-label`,
a click handler. Declaring a parameter for each of them would never end.

Try passing a title and a click handler in `App.tsazor`:

```tsazor
<FancyButton label="Push me" title="Go on, push it." @onclick="push" />
```

The compiler refuses: `FancyButton` has no parameter `title` (or `onclick`). Let's tell it to
collect everything it doesn't know. In `FancyButton.tsazor`, add a parameter that captures
unmatched values:

```ts
@Parameter({ captureUnmatchedValues: true }) attributes?: Record<string, unknown>;
```

and spread it onto the button with `@attributes`:

```tsazor
<button class="fancy" @attributes="attributes">@label</button>
```

Hover the button for the title, click it to count. Every attribute the component doesn't
declare as a parameter lands in that one record — and `@attributes` adds all of them to the
element. The event handler too: it still runs `push` on `App`, and `App` re-renders.

Order matters when a name appears twice: attributes are applied left to right and the last
one wins. Here `class="fancy"` comes first, so a parent could replace it with its own
`class`; write it after `@attributes` to make it fixed.

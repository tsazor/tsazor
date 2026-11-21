---
title: Event modifiers
keywords: preventDefault, stopPropagation, event modifiers
focus: App.tsazor
gate: click .card button
---

Clicking the card opens it; the **Archive** button inside should archive it. Click
**Archive** and read the log: "archived, opened". The click bubbled up from the button to
the card, so both handlers ran.

You could call `event.stopPropagation()` in the handler, but there's a declarative way that
keeps the handler about archiving — an event modifier:

```tsazor
<button @onclick="archive" @onclick:stopPropagation>Archive</button>
```

There are two modifiers, for the two things you commonly want from the browser:

- `@on<event>:stopPropagation` — the event doesn't bubble to the parent elements.
- `@on<event>:preventDefault` — the browser's default action doesn't happen: a form isn't
  submitted the old-fashioned way, a link isn't followed.

```tsazor
<form @onsubmit="save" @onsubmit:preventDefault>
```

A modifier doesn't need a handler of its own (`<a href="/" @onclick:preventDefault>`), and it
can take a condition that's re-evaluated on every render:
`@onclick:stopPropagation="isNested"`.

Calling `event.preventDefault()` or `event.stopPropagation()` inside a handler works too —
handlers run synchronously, while the browser is still dispatching the event. The modifiers
are simply the version you can read in the markup.

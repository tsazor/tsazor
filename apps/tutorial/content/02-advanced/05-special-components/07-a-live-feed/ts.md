---
title: A live feed
keywords: Virtualize, AnchorMode, VirtualizeAnchorMode, live feed, follow new items
focus: App.tsazor
layoutOnly: true
---

The ovens report an event every 700 ms, and each one lands at the bottom of the feed, out of
sight. Make the feed follow them: set `Virtualize`'s `AnchorMode` to `End`.

```tsazor
<Virtualize Items="@events" Context="event" AnchorMode="@VirtualizeAnchorMode.End">
```

`VirtualizeAnchorMode` comes from `@tsazor/runtime`, next to `Virtualize`. The feed now starts at
the bottom and moves with each new event.

Scroll up to read an older event: the feed stops following, so the event you're reading stays
where it is. Scroll back to the bottom, and it follows again.

The default, `Start`, does the same at the top, for a list whose new items arrive first. `None`
never follows.

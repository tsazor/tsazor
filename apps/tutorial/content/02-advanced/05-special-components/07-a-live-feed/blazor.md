---
title: A live feed
keywords: Virtualize, AnchorMode, VirtualizeAnchorMode, live feed, follow new items
focus: App.tsazor
layoutOnly: true
---

Blazor 11's `AnchorMode`. The oven events arrive at the bottom, out of sight. Make the feed follow
them:

```tsazor
<Virtualize Items="@events" Context="event" AnchorMode="@VirtualizeAnchorMode.End">
```

As in Blazor 11, following stops while the user reads further up, and starts again at the bottom.

> **Coming from Blazor:** `VirtualizeAnchorMode` is a TypeScript enum with the same flags
> (`Start | End` works). Tsazor fixes a few of Blazor 11's edge cases: a row deleted above the
> viewport keeps the visible rows in place, and Home pressed soon after End reaches the top.

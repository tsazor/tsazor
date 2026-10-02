---
title: Not found
focus: App.tsazor
gate: click nav a:nth-child(3)
---

The menu promises a Bread page that doesn't exist — `/bread` matches no route.
Click it: the router's `NotFound` slot runs, and the current placeholder is a
lonely `?`. A "?" is honest but unhelpful; a real app answers with a proper
"lost" page: what happened, and the way back.

Anything can sit in the `NotFound` slot, including a component. Make one —
`Lost.tsazor`, ordinary markup, no `@page` (it isn't a route; it renders *when
there is no route*):

```tsazor
<h2>Lost in the oven</h2>
<p>That page doesn't exist — but the bread always finds its way back.</p>
<p><a href="/">Take me home</a></p>
```

Then give the slot to it in `App.tsazor`:

```tsazor
<NotFound>
    <Lost />
</NotFound>
```

The `NotFound` answer covers more than a mislabeled menu link. When the app
starts, the router first matches the URL it *arrived* on — a bookmark straight
to `/orders/101`, a link someone pasted into a chat, the address a user typed.
Every URL that can reach the app must land somewhere, and when it matches
nothing, the lost page is the landing; its link home is just an anchor, because
anchors are navigation — by now you know how that works.

The `NotFound` fragment gets no route data — there is none. But the lost page
can still name the road that dead-ended: inject the navigator and read
`navigation.baseRelativePath`, which still holds the unmatched path. It is
relative to the app's root without the leading slash, so the markup puts the
slash in front:

```tsazor
@inject NavigationManager navigation
<p>There is nothing at <code>/@(this.navigation.baseRelativePath)</code>.</p>
```

Small touch, real apps want it — users paste the failing address into bug
reports.
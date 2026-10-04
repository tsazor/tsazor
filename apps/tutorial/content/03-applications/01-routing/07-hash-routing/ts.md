---
title: Hash routing
focus: Program.ts
gate: click nav a:nth-child(2); click .filters a:nth-child(2)
---

Your app works as long as the server plays along. Open `/orders` directly, or reload it,
and the browser asks the server for that path. A static file host (a folder of files, no
app server) has nothing there and answers 404. Switch the app to **hash routing**, which
works on any static host.

In `Program.ts`, set the routing mode:

```ts
createTsazorApp({ root: App, routing: { mode: "hash" } });
```

Now the route lives in the URL's fragment, after the `#`: `/#/orders`. The browser never
sends the fragment to the server, so every address loads the same `index.html`, and the
router reads the route from the fragment. Click through the menu and watch the address bar.

`NavLink` adjusts its links by itself. Plain `<a>` tags don't: in hash mode only links
that start with `#/` are routes. `/orders?state=open` would load a new document. Fix the
filter links in `Orders.tsazor` and the link in `Lost.tsazor`:

```tsazor
<a href="#/orders?state=open">Open</a>
```

Hash routing is Tsazor's addition. The default stays path routing, which gives cleaner
addresses. Choose hash routing when you can't configure the server to answer every path
with `index.html`.

---
title: Injecting services
focus: CartBadge.tsazor
gate: click .products button
---

Some state belongs to no component in particular: the cart of a shop, the signed-in user, an
API client. `Cart.ts` is such a class — plain TypeScript. Add a few products: the badge in the
header stays at 0.

That's because `CartBadge` made its own cart with `new Cart()`, and `Products` adds to a
different one. Both should use *the app's* cart. Look at `Program.ts`, the file that starts the
app:

```ts
createTsazorApp({
    root: App,
    services: (services) => {
        services.registerType(Cart);
    },
});
```

It registers `Cart` as a *service*: the app creates one when somebody asks for it, and hands
out that same instance from then on. `Products` asks with `@inject Cart cart`. Do the same in
`CartBadge` — replace the `@import` and the `new Cart()` field:

```tsazor
@inject Cart cart
```

Now the badge counts. `@inject Cart cart` declares a field `cart`, filled before
`onInitialized` runs. The class is the key you ask with, so `Cart` is found by its file name
like a component tag (`Cart.ts` exporting `Cart`) — no import needed. In `@code` you can write
the same as `cart = inject(Cart)`, with an `@import` for `Cart`.

The `observe` call is still needed: the badge's cart changes when *another* component clicks,
and `observe` re-renders the badge on every change (you met it in "External data").

Why not simply `export const cart = new Cart()` in `Cart.ts` and import it everywhere? For a
small app, that works. Services earn their keep as the app grows:

- **Dependencies are explicit.** A service can need other services:
  `services.register(Checkout, (s) => new Checkout(s.get(Cart)))`.
- **Tests can swap them.** `render(App, { services: (s) => s.registerValue(Cart, fakeCart) })`
  in `@tsazor/testing` — no module mocking.
- **Lifetimes.** Not every service should be shared. That's the next lesson.

---
title: Injecting services
keywords: services, @inject, dependency injection, shared state
focus: CartBadge.tsazor
gate: click .products button
---

Dependency injection, the Blazor way. `Program.ts` is your `Program.cs`:

```ts
createTsazorApp({
    root: App,
    services: (services) => {
        services.registerType(Cart);
    },
});
```

`Products` gets the cart with `@inject Cart cart`; `CartBadge` still news one up, so its count
stays at 0. Inject it there too:

```tsazor
@inject Cart cart
```

The badge observes the cart (`this.observe(this.cart)`, from "External data") because the
changes come from a sibling — the same reason you'd subscribe to a state container's `OnChange`
in Blazor.

> **Coming from Blazor:** the token is the class itself — TypeScript interfaces don't exist at
> runtime, so there's no `AddScoped<IFoo, Foo>()`. Register an implementation under a base
> class instead: `services.register(AuthenticationStateProvider, () => new MyProvider())`.
> The API: `registerType(Foo, options?)` (Blazor's `AddX<Foo>()`; the factory is `new
> Foo(services)`), `register(Foo, (services) => …, options?)` (a factory, `s.get(Bar)` for
> dependencies), `registerValue(Foo, instance)` (`AddSingleton(instance)`). `@inject Cart cart`
> is the field initializer `cart = inject(Cart)`; the type resolves like a tag (`Cart.ts`
> exporting `Cart`, or a `@using` folder), `inject()` in `@code` needs an `@import`. There's
> no constructor injection — components are created by the renderer, as in Blazor.

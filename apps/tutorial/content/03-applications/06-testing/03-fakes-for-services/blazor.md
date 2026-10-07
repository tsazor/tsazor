---
title: Fakes for services
keywords: fakes, services, testing, dependency injection
focus: OpenSign.test.ts
---

The test fails with *Service not registered: BakeryClock*. Register a fake clock through
`render`'s `services` option:

```ts
const clockAt = (time: string) => (services: ServiceCollection) =>
    services.registerValue(BakeryClock, { now: () => new Date(`2026-10-05T${time}`) });

const sign = await render(OpenSign, { services: clockAt("08:00") });
```

Add a second test with `clockAt("21:00")` that expects "Closed".

> **Coming from Blazor:** this is bUnit's `Services.AddSingleton(fake)`. You need no
> `IClock` interface and no mocking library: TypeScript compares shapes, so any object with
> a `now()` method fits where a `BakeryClock` is expected. It's the same idea as .NET 8's
> `TimeProvider` with a fake in tests.

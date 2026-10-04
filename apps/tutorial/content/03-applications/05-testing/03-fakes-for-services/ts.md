---
title: Fakes for services
focus: OpenSign.test.ts
---

`OpenSign` shows "Open" from seven to six, and its test fails: *Service not registered:
BakeryClock*. The sign injects the clock, and a test has no `Program.ts` that registers it.
Register one in the test, a fake whose time you choose:

```ts
const clockAt = (time: string) => (services: ServiceCollection) =>
    services.registerValue(BakeryClock, { now: () => new Date(`2026-10-05T${time}`) });
```

Import `BakeryClock` from `./BakeryClock` and the type `ServiceCollection` from
`@tsazor/testing`. The fake is a plain object with a `now` method. TypeScript accepts it
as a `BakeryClock` because it has the same shape.

Pass it to `render`, and add the evening:

```ts
const sign = await render(OpenSign, { services: clockAt("08:00") });
```

```ts
it("is closed at night", async () => {
    const sign = await render(OpenSign, { services: clockAt("21:00") });
    expect(sign.find(".sign").textContent).toBe("Closed");
});
```

Why not the real clock? The test would pass in the morning and fail at night. With a fake
it gives the same answer every time. That's why the sign injects the clock instead of
calling `new Date()` itself.

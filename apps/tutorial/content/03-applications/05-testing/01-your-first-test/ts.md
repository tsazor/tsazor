---
title: Your first test
focus: Basket.test.ts
---

`Basket.tsazor` counts loaves, and `Basket.test.ts` already has one test: a new basket
starts empty. The preview runs the tests and shows the report instead of the app. Add a
second test: one click on the button gives one loaf.

```ts
it("counts a click", async () => {
    const basket = await render(Basket);
    await basket.click("button");
    expect(basket.find("output").textContent).toBe("1");
});
```

`render` mounts the component the way the app would and waits until it has rendered.
`click` clicks the element like a user would and waits again, so the next line sees the new
state. `find` returns the first element that matches the CSS selector and fails the test
when there is none.

`describe`, `it` and `expect` come from **Vitest**, the usual test runner for TypeScript
projects. In your project, `npx vitest` runs every `*.test.ts` file. The preview runs a
small version of it.

> **Plain DOM works too.** `basket.container` is an ordinary element, so
> `basket.container.querySelector("output")` finds the same thing. `find` adds the clear
> failure message, and `click` adds the wait for the render.

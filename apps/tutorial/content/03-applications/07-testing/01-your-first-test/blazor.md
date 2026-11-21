---
title: Your first test
keywords: testing, render, @tsazor/testing, expect, bUnit
focus: Basket.test.ts
---

Add a second test to `Basket.test.ts`: one click gives one loaf. The preview runs the tests
and shows the report.

```ts
it("counts a click", async () => {
    const basket = await render(Basket);
    await basket.click("button");
    expect(basket.find("output").textContent).toBe("1");
});
```

> **Coming from Blazor:** this is bUnit. `render(Basket)` is `RenderComponent<Basket>()`,
> `find` is `cut.Find`, `click` is `.Click()`, and `basket.markup` is `cut.Markup`. Vitest
> plays xUnit's part: `describe` groups like a test class, `it` is a `[Fact]`, and
> `expect(x).toBe(y)` is `Assert.Equal(y, x)`. Run them with `npx vitest`.

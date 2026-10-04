---
title: Parameters in tests
focus: PriceTag.test.ts
---

`PriceTag` shows a price that its parent passes as `cents`. The test renders it without
that parameter, so it only ever checks €0.00. Test the real case: pass the parameter, then
change it.

```ts
const tag = await render(PriceTag, { parameters: { cents: 340 } });
expect(tag.find(".price").textContent).toBe("€3.40");
```

`parameters` are what a parent's attributes would pass. They are typed like the component's
fields: `cents` must be a number, and a misspelled name is an error before the test runs.

Then add a test that changes the price after the first render:

```ts
it("follows a new price", async () => {
    const tag = await render(PriceTag, { parameters: { cents: 340 } });
    await tag.setParameters({ cents: 1205 });
    expect(tag.find(".price").textContent).toBe("€12.05");
});
```

`setParameters` passes new values, as when the parent renders again, and waits for the
render.

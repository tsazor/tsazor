---
title: Parameters in tests
focus: PriceTag.test.ts
---

Pass `cents` when you render `PriceTag`, and test a changed price too:

```ts
const tag = await render(PriceTag, { parameters: { cents: 340 } });
expect(tag.find(".price").textContent).toBe("€3.40");

await tag.setParameters({ cents: 1205 });
expect(tag.find(".price").textContent).toBe("€12.05");
```

Put the second half into its own test, `it("follows a new price", …)`.

> **Coming from Blazor:** bUnit's `RenderComponent<PriceTag>(p => p.Add(x => x.Cents, 340))`
> becomes an object literal, and `SetParametersAndRender` becomes `setParameters`. The
> object is checked against the component's fields, as the lambda is in bUnit.

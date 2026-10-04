---
title: Testing a form
focus: PreOrder.test.ts
---

`PreOrder` is a form with one rule: a name is required. Its test fills in a name and
reserves. Add the other half: without a name, the form shows the message and reserves
nothing.

```ts
it("asks for a name before it reserves", async () => {
    const form = await render(PreOrder);
    await form.click("button");
    expect(form.find(".validation-message").textContent).toBe("The name field is required.");
    expect(form.findAll(".success")).toHaveLength(0);
});
```

In the first test, `change` sets the input's value and raises the `change` event, which is
what `@bind` listens to. The button submits the form as in the browser, and the rules run.
`findAll` returns every match; an empty list means there is none.

That's testing in Tsazor: render a component, act like a user, check what's on the page.
Fakes for services and the server keep each test the same every time.

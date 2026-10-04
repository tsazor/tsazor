---
title: Testing a form
focus: PreOrder.test.ts
---

Add the test for an empty name: submit without typing, expect the validation message and
no reservation.

```ts
it("asks for a name before it reserves", async () => {
    const form = await render(PreOrder);
    await form.click("button");
    expect(form.find(".validation-message").textContent).toBe("The name field is required.");
    expect(form.findAll(".success")).toHaveLength(0);
});
```

> **Coming from Blazor:** bUnit's `cut.Find("input").Change("Marta")` is
> `form.change("input", "Marta")`. bUnit submits with `Find("form").Submit()`. Here you
> click the submit button, and the browser raises the form's submit event.
> `DataAnnotationsValidator` runs the same rules and messages as in the app.

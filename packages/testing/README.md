# @tsazor/testing

Component tests for [Tsazor](../../README.md), in the manner of bUnit: render a component, find elements, click,
type, and assert on what it rendered. Runs in Vitest with happy-dom.

```bash
npm install -D @tsazor/testing vitest happy-dom
```

```ts
import { expect, test } from "vitest";
import { render } from "@tsazor/testing";
import Counter from "./Counter.tsazor";

test("Click me increments the count", async () => {
  const counter = await render(Counter);
  expect(counter.find("[role=status]").textContent).toBe("Current count: 0");

  await counter.click("button");

  expect(counter.find("[role=status]").textContent).toBe("Current count: 1");
});
```

`render(Component, { parameters, services })` passes parameters and registers fakes; `createFakeStore` and
`createFakeLocalization` stand in for state and translations. See [patterns](../../docs/patterns.md) for testable
components.

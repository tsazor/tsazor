import { expect, test } from "vitest";
import { render } from "@tsazor/testing";
import Counter from "./Counter.tsazor";

test("Click me increments the count", async () => {
    const counter = await render(Counter);
    expect(counter.find("[role=status]").textContent).toBe("Current count: 0");

    await counter.click("button");

    expect(counter.find("[role=status]").textContent).toBe("Current count: 1");
});

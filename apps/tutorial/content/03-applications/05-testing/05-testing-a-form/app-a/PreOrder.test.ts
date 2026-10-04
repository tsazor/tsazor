import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import PreOrder from "./PreOrder.tsazor";

describe("PreOrder", () => {
    it("reserves for the name", async () => {
        const form = await render(PreOrder);
        await form.change("input", "Marta");
        await form.click("button");
        expect(form.find(".success").textContent).toBe("Reserved for Marta.");
    });
});

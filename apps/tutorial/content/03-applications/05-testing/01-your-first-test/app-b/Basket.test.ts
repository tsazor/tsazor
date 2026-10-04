import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import Basket from "./Basket.tsazor";

describe("Basket", () => {
    it("starts empty", async () => {
        const basket = await render(Basket);
        expect(basket.find("output").textContent).toBe("0");
    });

    it("counts a click", async () => {
        const basket = await render(Basket);
        await basket.click("button");
        expect(basket.find("output").textContent).toBe("1");
    });
});

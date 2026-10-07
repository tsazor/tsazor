import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import Basket from "./Basket.tsazor";

describe("Basket", () => {
    it("starts empty", async () => {
        const basket = await render(Basket);
        expect(basket.find("output").textContent).toBe("0");
    });
});

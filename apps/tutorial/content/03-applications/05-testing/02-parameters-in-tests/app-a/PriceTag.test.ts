import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import PriceTag from "./PriceTag.tsazor";

describe("PriceTag", () => {
    it("shows the price in euros", async () => {
        const tag = await render(PriceTag);
        expect(tag.find(".price").textContent).toBe("€0.00");
    });
});

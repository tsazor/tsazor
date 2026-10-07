import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import PriceTag from "./PriceTag.tsazor";

describe("PriceTag", () => {
    it("shows the price in euros", async () => {
        const tag = await render(PriceTag, { parameters: { cents: 340 } });
        expect(tag.find(".price").textContent).toBe("€3.40");
    });

    it("follows a new price", async () => {
        const tag = await render(PriceTag, { parameters: { cents: 340 } });
        await tag.setParameters({ cents: 1205 });
        expect(tag.find(".price").textContent).toBe("€12.05");
    });
});

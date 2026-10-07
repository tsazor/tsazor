import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import OpenSign from "./OpenSign.tsazor";

describe("OpenSign", () => {
    it("is open at eight in the morning", async () => {
        const sign = await render(OpenSign);
        expect(sign.find(".sign").textContent).toBe("Open");
    });
});

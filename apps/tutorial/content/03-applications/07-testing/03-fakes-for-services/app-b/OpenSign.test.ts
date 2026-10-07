import { describe, expect, it } from "vitest";
import { render, type ServiceCollection } from "@tsazor/testing";
import { BakeryClock } from "./BakeryClock";
import OpenSign from "./OpenSign.tsazor";

/** A clock that always shows the same time. */
const clockAt = (time: string) => (services: ServiceCollection) =>
    services.registerValue(BakeryClock, { now: () => new Date(`2026-10-05T${time}`) });

describe("OpenSign", () => {
    it("is open at eight in the morning", async () => {
        const sign = await render(OpenSign, { services: clockAt("08:00") });
        expect(sign.find(".sign").textContent).toBe("Open");
    });

    it("is closed at night", async () => {
        const sign = await render(OpenSign, { services: clockAt("21:00") });
        expect(sign.find(".sign").textContent).toBe("Closed");
    });
});

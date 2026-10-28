/** A menu entry that is a link (MudMenuItem's Href/Target; BlazorHero's document download, B40). */
import { describe, expect, it } from "vitest";
import { EventCallback } from "@tsazor/runtime";
import { render } from "@tsazor/testing";
import { MenuItem } from "../dist/index.js";

describe("MenuItem href", () => {
  it("is a link while enabled — a new tab with rel=noopener — and a disabled button without one, focusable (aria-disabled) and doing nothing", async () => {
    const link = await render(MenuItem, { parameters: { href: "/files/a.pdf", target: "_blank" } });
    const anchor = link.find("a[role=menuitem]");
    expect([anchor.getAttribute("href"), anchor.getAttribute("target"), anchor.getAttribute("rel")]).toEqual(["/files/a.pdf", "_blank", "noopener"]);
    link.dispose();
    let selected = 0;
    const disabled = await render(MenuItem, { parameters: { href: "/files/a.pdf", disabled: true, onSelect: EventCallback.unbound(() => void selected++) } });
    expect(disabled.container.querySelector("a")).toBeNull();
    const button = disabled.find("button[role=menuitem]") as HTMLButtonElement;
    expect([button.disabled, button.getAttribute("aria-disabled")]).toEqual([false, "true"]);
    await disabled.click("button[role=menuitem]");
    expect(selected).toBe(0);
    disabled.dispose();
  });
});

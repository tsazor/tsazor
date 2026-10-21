/** A menu entry that is a link (MudMenuItem's Href/Target; BlazorHero's document download, B40). */
import { describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import { DropdownItem } from "../dist/index.js";

describe("DropdownItem href", () => {
  it("is a link while enabled — a new tab with rel=noopener — and a disabled button without one", async () => {
    const link = await render(DropdownItem, { parameters: { href: "/files/a.pdf", target: "_blank" } });
    const anchor = link.find("a[role=menuitem]");
    expect([anchor.getAttribute("href"), anchor.getAttribute("target"), anchor.getAttribute("rel")]).toEqual(["/files/a.pdf", "_blank", "noopener"]);
    link.dispose();
    const disabled = await render(DropdownItem, { parameters: { href: "/files/a.pdf", disabled: true } });
    expect(disabled.container.querySelector("a")).toBeNull();
    expect((disabled.find("button[role=menuitem]") as HTMLButtonElement).disabled).toBe(true);
    disabled.dispose();
  });
});

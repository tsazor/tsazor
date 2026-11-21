/** Tabs over a changing set (B41: BlazorHero's extended attribute groups): a tab's badge, a changed title or badge, a tab that goes. */
import { afterAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import type { RenderTreeBuilder } from "@tsazor/runtime";
import { Tab, Tabs } from "../dist/index.js";

async function settle(result: { settle(): Promise<void> }): Promise<void> {
  await result.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await result.settle();
}

afterAll(() => {
  document.body.innerHTML = "";
});

describe("Tabs over a changing set", () => {
  it("shows a tab's badge, follows a changed title or badge, and drops a tab that goes", async () => {
    let groups: { title: string; badge: string }[] = [
      { title: "All Groups", badge: "2/3" },
      { title: "Shipping", badge: "1/1" },
      { title: "Billing", badge: "0/1" },
    ];
    const result = await renderTree((b) => {
      b.openComponent(0, Tabs);
      b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => {
        for (const [i, group] of groups.entries()) {
          c.openComponent(10 + i, Tab);
          c.setKey(group.title);
          c.addAttribute(1, "title", group.title);
          c.addAttribute(2, "badge", group.badge);
          c.addAttribute(3, "childContent", (t: RenderTreeBuilder) => t.addContent(0, `${group.title} body`));
          c.closeComponent();
        }
      });
      b.closeComponent();
    });
    await settle(result);
    const tabs = () => [...result.container.querySelectorAll(".nav-tabs .nav-link")].map((tab) => tab.textContent);
    expect(tabs()).toEqual(["All Groups2/3", "Shipping1/1", "Billing0/1"]);

    groups = [{ title: "All Groups", badge: "3/3" }, { title: "Billing", badge: "1/1" }];
    await result.rerender();
    await settle(result);
    expect(tabs()).toEqual(["All Groups3/3", "Billing1/1"]);
  });
});

/**
 * Avatar in Bootstrap (the Fluent skin's parameters): image, else initials, else an icon; named by `name`; colorful picks a
 * color by the name; a button with onClick (Enter and Space click it).
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import { EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { avatarColorFor } from "@tsazor/ui/kit";
import { Avatar } from "../dist/index.js";

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

async function avatar(attrs: (b: RenderTreeBuilder) => void): Promise<HTMLElement> {
  const result = await renderTree((b) => {
    b.openComponent(0, Avatar);
    attrs(b);
    b.closeComponent();
  });
  mounted.push(result);
  await result.settle();
  return result.container.querySelector<HTMLElement>("[class*=rounded]")!;
}

describe("Avatar", () => {
  it("shows the name's initials and is an image named by it", async () => {
    const root = await avatar((b) => b.addAttribute(1, "name", "Ada Lovelace"));
    expect(root.textContent).toBe("AL");
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-label")).toBe("Ada Lovelace");
    expect(root.className).toContain("rounded-circle");
    expect(root.style.width).toBe("32px");
    expect(root.style.background).toContain("var(--bs-secondary-bg)");
  });

  it("an image wins over the initials; without both it shows a person icon", async () => {
    const pictured = await avatar((b) => {
      b.addAttribute(1, "name", "Ada Lovelace");
      b.addAttribute(2, "image", "/ada.png");
    });
    expect(pictured.querySelector("img")!.getAttribute("src")).toBe("/ada.png");
    expect(pictured.querySelector("img")!.getAttribute("alt")).toBe("");
    expect(pictured.textContent).toBe("");
    const plain = await avatar((b) => b.addAttribute(1, "size", 48));
    const icon = plain.querySelector("svg")!;
    expect(icon.getAttribute("width")).toBe("24");
    // No name: decoration.
    expect(plain.getAttribute("aria-hidden")).toBe("true");
    expect(plain.hasAttribute("role")).toBe(false);
  });

  it("colorful picks the name's color; initials, shape, size and active come through", async () => {
    const root = await avatar((b) => {
      b.addAttribute(1, "name", "Grace Hopper");
      b.addAttribute(2, "color", "colorful");
      b.addAttribute(3, "initials", "GH!");
      b.addAttribute(4, "shape", "square");
      b.addAttribute(5, "active", true);
    });
    // A named color is a tint of Bootstrap's hue, behind the emphasis color; the ring is the hue.
    expect(avatarColorFor("colorful", "Grace Hopper")).not.toBe("colorful");
    // (happy-dom drops a color-mix() background; the skins app's gate sees it in the browsers.)
    expect(root.style.color).toBe("var(--bs-emphasis-color)");
    expect(root.style.outlineOffset).toBe("2px");
    expect(root.style.outline).toContain("var(--bs-");
    expect(root.className.split(" ")).toContain("rounded");
    expect(root.textContent).toBe("GH!");
    const dimmed = await avatar((b) => b.addAttribute(1, "active", false));
    expect(dimmed.className).toContain("opacity-75");
  });

  it("with onClick it is a button that Enter and Space click", async () => {
    let clicks = 0;
    const root = await avatar((b) => {
      b.addAttribute(1, "name", "Ada Lovelace");
      b.addAttribute(2, "onClick", EventCallback.unbound(() => {
        clicks++;
      }));
    });
    expect(root.getAttribute("role")).toBe("button");
    expect(root.getAttribute("tabindex")).toBe("0");
    root.click();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    root.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(clicks).toBe(3);
  });
});

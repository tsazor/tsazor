/**
 * Link (Fluent UI Blazor's FluentLink, MudBlazor's MudLink), Image (FluentImage, MudImage) and ScrollToTop
 * (MudScrollToTop): what each renders and does, the same in both skins.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type ComponentType, type RenderTreeBuilder } from "@tsazor/runtime";
import { Image, Link, ScrollToTop } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

async function one(component: ComponentType, attrs: Record<string, unknown>, text?: string): Promise<HTMLElement> {
  const result = await renderTree((b) => {
    b.openComponent(0, component);
    let seq = 1;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
    if (text !== undefined) b.addAttribute(30, "childContent", (c: RenderTreeBuilder) => c.addContent(0, text));
    b.closeComponent();
  });
  mounted.push(result);
  await result.settle();
  return result.container.firstElementChild as HTMLElement;
}

describe("Link", () => {
  it("is an anchor to href with its text", async () => {
    const link = await one(Link, { href: "/orders", hrefLang: "en" }, "Orders");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/orders");
    expect(link.getAttribute("hreflang")).toBe("en");
    expect(link.textContent).toBe("Orders");
    expect(link.hasAttribute("rel")).toBe(false);
  });

  it("a new tab gets noopener; forceLoad is rel external, beside the caller's rel", async () => {
    expect((await one(Link, { href: "https://example.org", target: "_blank" }, "Out")).getAttribute("rel")).toBe("noopener");
    expect((await one(Link, { href: "/login", forceLoad: true, rel: "nofollow" }, "Log in")).getAttribute("rel")).toBe("nofollow external");
  });

  it("without href but with onClick it is a button that raises it", async () => {
    let clicks = 0;
    const link = await one(Link, { onClick: EventCallback.unbound(() => void clicks++) }, "Undo");
    expect(link.tagName).toBe("BUTTON");
    expect(link.getAttribute("type")).toBe("button");
    link.click();
    expect(clicks).toBe(1);
  });

  it("disabled: no href, aria-disabled, and a click goes nowhere", async () => {
    let clicks = 0;
    const link = await one(Link, { href: "/orders", disabled: true, onClick: EventCallback.unbound(() => void clicks++) }, "Orders");
    expect(link.hasAttribute("href")).toBe(false);
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("role")).toBe("link");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(clicks).toBe(0);
  });
});

describe("Image", () => {
  it("is an img with its source, its text, numbers as width and height, lazy", async () => {
    const image = await one(Image, { source: "/bread.png", alternateText: "A rye loaf", width: 120, height: 80 });
    expect(image.tagName).toBe("IMG");
    expect(image.getAttribute("src")).toBe("/bread.png");
    expect(image.getAttribute("alt")).toBe("A rye loaf");
    expect(image.getAttribute("width")).toBe("120");
    expect(image.getAttribute("height")).toBe("80");
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  it("fit, position and CSS lengths go into its style; an empty text marks it decorative", async () => {
    const image = await one(Image, { source: "/bread.png", alternateText: "", fit: "cover", position: "top", width: "100%" });
    expect(image.getAttribute("alt")).toBe("");
    expect(image.style.objectFit).toBe("cover");
    expect(image.style.objectPosition).toBe("top");
    expect(image.style.width).toBe("100%");
    expect(image.hasAttribute("width")).toBe(false);
  });
});

describe("ScrollToTop", () => {
  it("appears once the element scrolls past topOffset, and its click scrolls it back", async () => {
    let positions: number[] = [];
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "div");
        b.addAttribute(1, "id", "scroller");
        b.addAttribute(2, "style", "height: 100px; overflow: auto");
        b.openElement(3, "div");
        b.addAttribute(4, "style", "height: 2000px");
        b.openElement(10, "a");
        b.addAttribute(11, "href", "#start");
        b.addContent(12, "Start");
        b.closeElement();
        b.closeElement();
        b.closeElement();
        b.openComponent(5, ScrollToTop);
        b.addAttribute(6, "selector", "#scroller");
        b.addAttribute(7, "topOffset", 200);
        b.addAttribute(8, "scrollBehavior", "instant");
        b.addAttribute(9, "onScroll", EventCallback.unbound((args: { scrollTop: number }) => void positions.push(args.scrollTop)));
        b.closeComponent();
      }
    }
    const result = await render(Host);
    mounted.push(result);
    const idle = () => result.settle();
    const scroller = result.container.querySelector<HTMLElement>("#scroller")!;
    const button = () => result.container.querySelector<HTMLButtonElement>("button");
    expect(button()).toBeNull();
    positions = [];
    scroller.scrollTop = 500;
    scroller.dispatchEvent(new Event("scroll"));
    await idle();
    expect(positions).toEqual([500]);
    expect(button()!.getAttribute("aria-label")).toBe("Back to top");
    button()!.focus();
    button()!.click();
    await idle();
    // The button hides at the top; a keyboard user goes on from there, not from the body.
    expect(document.activeElement).toBe(scroller.querySelector("a"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    scroller.dispatchEvent(new Event("scroll"));
    await idle();
    expect(scroller.scrollTop).toBe(0);
    expect(button()).toBeNull();
  });
});

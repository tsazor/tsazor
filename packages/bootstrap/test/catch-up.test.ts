/**
 * The components the Bootstrap skin caught up with (wave A): CheckboxGroup and SidebarNav behave as the Fluent
 * skin's, in Bootstrap's markup. Autocomplete and TreeView have their own files (autocomplete.test.ts,
 * tree-view.test.ts), taken from the Fluent skin's.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree } from "@tsazor/testing";
import { ComponentBase, EventCallback, NavigationManager, NavLinkMatch, type RenderTreeBuilder } from "@tsazor/runtime";
import { CheckboxGroup, SidebarNav } from "../dist/index.js";

async function settle(renderer: Awaited<ReturnType<typeof renderTree>>["renderer"]): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

const navigations: NavigationManager[] = [];
afterEach(() => {
  document.body.innerHTML = "";
  for (const navigation of navigations.splice(0)) navigation.dispose();
});

describe("CheckboxGroup", () => {
  it("checks the bound values, reports the new array in the options' order, and keeps values it doesn't show", async () => {
    const reported: string[][] = [];
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, CheckboxGroup);
      b.addAttribute(1, "label", "Roles");
      b.addAttribute(2, "options", [{ value: "admins", label: "Administrators" }, { value: "editors", label: "Editors" }, { value: "guests", label: "Guests", disabled: true }]);
      b.addAttribute(3, "value", ["authenticated", "editors"]);
      b.addAttribute(4, "valueChanged", EventCallback.unbound((value: string[]) => {
        reported.push(value);
      }));
      b.addAttribute(5, "inline", true);
      b.closeComponent();
    });
    await settle(renderer);
    expect(container.querySelector("fieldset legend")!.textContent).toBe("Roles");
    expect([...container.querySelectorAll(".form-check")].every((check) => check.classList.contains("form-check-inline"))).toBe(true);
    const boxes = [...container.querySelectorAll<HTMLInputElement>("input[type=checkbox].form-check-input")];
    expect(boxes.map((box) => box.checked)).toEqual([false, true, false]);
    expect(boxes[2]!.disabled).toBe(true);
    expect(container.querySelector(`label[for="${boxes[0]!.id}"]`)!.textContent).toBe("Administrators");
    boxes[0]!.checked = true;
    boxes[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(reported).toEqual([["authenticated", "admins", "editors"]]);
  });
});

class NavHost extends ComponentBase {
  static compact = false;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, SidebarNav);
    b.addAttribute(1, "ariaLabel", "Primary");
    b.addAttribute(2, "links", [
      { href: "/", label: "Overview", match: NavLinkMatch.All },
      { href: "/orders", label: "Orders" },
      { href: "/settings", label: "Settings" },
    ]);
    b.addAttribute(3, "compact", NavHost.compact);
    b.closeComponent();
  }
}

async function nav(path: string, compact = false) {
  const navigation = new NavigationManager();
  navigations.push(navigation);
  navigation.navigateTo(path);
  NavHost.compact = compact;
  const result = await render(NavHost, { services: (services) => services.registerValue(NavigationManager as never, navigation) });
  await settle(result.renderer);
  return result;
}

describe("SidebarNav", () => {
  it("is Bootstrap's vertical pills of NavLinks; the current route's link is active", async () => {
    const result = await nav("/orders");
    expect(result.container.querySelector("ul")!.className).toBe("nav nav-pills flex-column gap-1");
    const links = [...result.container.querySelectorAll("a.nav-link")];
    expect(links.map((a) => a.textContent)).toEqual(["Overview", "Orders", "Settings"]);
    expect(links[1]!.classList.contains("active")).toBe(true);
    expect(links[1]!.getAttribute("aria-current")).toBe("page");
    expect(links[0]!.classList.contains("active")).toBe(false);
    result.dispose();
  });

  it("names the nav; compact is the icon rail", async () => {
    const result = await nav("/", true);
    const element = result.container.querySelector("nav")!;
    expect(element.getAttribute("aria-label")).toBe("Primary");
    expect(element.className).toBe("tz-nav tz-nav--compact");
    result.dispose();
  });
});

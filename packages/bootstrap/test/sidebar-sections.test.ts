/**
 * SidebarNav's sections (MudBlazor's MudListSubheader, Fluent UI Blazor's FluentNavGroup), as BlazorHero's nav menu
 * has them: the links first, then each section a group named by its heading; a link may open in a new tab.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { NavigationManager, NavLinkMatch } from "@tsazor/runtime";
import { SidebarNav } from "../dist/index.js";

afterEach(() => {
  for (const navigation of navigations.splice(0)) navigation.dispose();
  document.body.innerHTML = "";
});

const navigations: NavigationManager[] = [];

async function nav(compact = false) {
  const navigation = new NavigationManager();
  navigations.push(navigation);
  return renderTree((b) => {
    b.openComponent(0, SidebarNav);
    b.addAttribute(1, "ariaLabel", "Main");
    b.addAttribute(2, "compact", compact);
    b.addAttribute(3, "links", [{ href: "/", label: "Home", match: NavLinkMatch.All }, { href: "/jobs", label: "Hangfire", target: "_blank" }]);
    b.addAttribute(4, "sections", [
      { heading: "Personal", links: [{ href: "/dashboard", label: "Dashboard" }, { href: "/account", label: "Account" }] },
      { heading: "Administrator", links: [{ href: "/identity/users", label: "Users" }] },
    ]);
    b.closeComponent();
  }, { services: (services) => services.registerValue(NavigationManager as never, navigation) });
}

describe("SidebarNav sections", () => {
  it("renders the links, then each section as a group named by its heading", async () => {
    const { container } = await nav();
    const navElement = container.querySelector("nav[aria-label=Main]")!;
    const parts = [...navElement.children] as HTMLElement[];
    expect(parts).toHaveLength(3);
    expect(parts[0]!.hasAttribute("role")).toBe(false);
    expect(parts[0]!.querySelector("a")!.textContent).toBe("Home");

    const groups = [...navElement.querySelectorAll<HTMLElement>("[role=group]")];
    expect(groups.map((group) => document.getElementById(group.getAttribute("aria-labelledby")!)!.textContent)).toEqual(["Personal", "Administrator"]);
    expect(groups.map((group) => [...group.querySelectorAll("a")].map((link) => link.textContent))).toEqual([["Dashboard", "Account"], ["Users"]]);
    // Lists stay lists: the group wraps the heading and its ul.
    expect(groups[0]!.querySelector("ul li a")).not.toBeNull();
  });

  it("the icon rail keeps the groups and their names", async () => {
    const { container } = await nav(true);
    const groups = [...container.querySelectorAll<HTMLElement>("[role=group]")];
    expect(groups).toHaveLength(2);
    expect(document.getElementById(groups[1]!.getAttribute("aria-labelledby")!)!.textContent).toBe("Administrator");
  });

  it("a link's target is its anchor's (MudNavLink Target): _blank leaves it to the browser; the others have none", async () => {
    const { container } = await nav();
    const anchor = (label: string) => [...container.querySelectorAll("a")].find((link) => link.textContent === label)!;
    expect(anchor("Hangfire").getAttribute("target")).toBe("_blank");
    expect(anchor("Home").hasAttribute("target")).toBe(false);
    expect(anchor("Users").hasAttribute("target")).toBe(false);
  });
});

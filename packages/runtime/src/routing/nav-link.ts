import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import { inject } from "../di/service-provider.js";
import { NavigationManager } from "../navigation/navigation-manager.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";

/** Blazor's NavLinkMatch: prefix matches the path start; all matches exactly. */
export enum NavLinkMatch {
  Prefix = 0,
  All = 1,
}

/**
 * Blazor's NavLink: an <a> that gains the active class when the current
 * location matches its href. Re-renders on every location change.
 */
export class NavLink extends ComponentBase {
  /** Target href, base-relative ("/counter"). */
  @Parameter() href = "";
  /** Default is prefix matching (Blazor's default). */
  @Parameter() match: NavLinkMatch = NavLinkMatch.Prefix;
  /** Class added while active. */
  @Parameter() activeClass = "active";
  /** Static classes always present on the anchor. */
  @Parameter() cssClass = "";
  /** Link content (markup between the NavLink tags). */
  @Parameter() childContent?: RenderFragment;

  private readonly navigation = this.inject(NavigationManager);
  private unsubscribe?: () => void;

  protected override onInitialized(): void {
    this.unsubscribe = this.navigation.addLocationChanged(() => this.stateHasChangedInternal());
  }

  dispose(): void {
    this.unsubscribe?.();
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (this.isActive(this.navigation.baseRelativePath)) {
      b.openElement(0, "a");
      b.addAttribute(1, "href", this.href);
      b.addAttribute(2, "class", joinClasses(this.cssClass, this.activeClass));
      b.addAttribute(3, "aria-current", "page");
      b.addContent(4, this.childContent);
      b.closeElement();
    } else {
      b.openElement(0, "a");
      b.addAttribute(1, "href", this.href);
      b.addAttribute(2, "class", this.cssClass);
      b.addContent(3, this.childContent);
      b.closeElement();
    }
  }

  private isActive(current: string): boolean {
    const href = this.href.split("?")[0]!;
    const path = current.split("?")[0]!;
    const normalizedCurrent = `/${path.replace(/^\/+/, "")}`;
    const normalizedHref = href === "" ? "/" : `/${href.replace(/^\/+/, "").replace(/\/+$/, "")}`;
    if (this.match === NavLinkMatch.All) {
      return normalizedCurrent === normalizedHref;
    }
    return normalizedCurrent === normalizedHref || normalizedCurrent.startsWith(`${normalizedHref}/`);
  }
}

function joinClasses(...classes: string[]): string {
  return classes.filter((c) => c.length > 0).join(" ");
}
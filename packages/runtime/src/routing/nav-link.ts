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
 *
 * Matching is Blazor's (.NET 8): the href is resolved against the base URI
 * and compared with the absolute current URI, case-insensitively. `All`
 * matches the URI exactly — also with a trailing slash only on the href, and
 * ignoring the current URI's query and fragment; `Prefix` additionally
 * matches URIs below the href at a separator (`/abc` covers `/abc/def` and
 * `/abc?x`, not `/abcdef`). So a Prefix link to the base (`""`, `"/"` without
 * a `<base>`) is active everywhere — the home link takes `NavLinkMatch.All`.
 */
export class NavLink extends ComponentBase {
  /** Target href: relative to the base URI ("counter"), root-relative ("/app/counter") or absolute. */
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
    if (navLinkMatches(this.navigation.toAbsoluteUri(this.href), this.navigation.uri, this.match)) {
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

}

/**
 * Blazor's NavLink.ShouldMatch over absolute URIs (`hrefAbsolute` =
 * NavigationManager.ToAbsoluteUri(href), `currentAbsolute` = its Uri).
 */
export function navLinkMatches(hrefAbsolute: string, currentAbsolute: string, match: NavLinkMatch): boolean {
  if (equalsHrefExactlyOrIfTrailingSlashAdded(currentAbsolute, hrefAbsolute)) return true;
  if (match === NavLinkMatch.Prefix && isStrictlyPrefixWithSeparator(currentAbsolute, hrefAbsolute)) return true;
  // All: the current URI's query and fragment do not count (.NET 8).
  if (match === NavLinkMatch.All) {
    const withoutQuery = currentAbsolute.replace(/[?#][\s\S]*$/, "");
    return withoutQuery !== currentAbsolute && equalsHrefExactlyOrIfTrailingSlashAdded(withoutQuery, hrefAbsolute);
  }
  return false;
}

const ignoreCase = (text: string): string => text.toLowerCase();

/** Equal, or the href has an extra trailing slash (`http://h/path/` is active at `http://h/path`). */
function equalsHrefExactlyOrIfTrailingSlashAdded(current: string, href: string): boolean {
  if (ignoreCase(current) === ignoreCase(href)) return true;
  return current.length === href.length - 1 && href.endsWith("/") && ignoreCase(href).startsWith(ignoreCase(current));
}

/** `prefix` starts `value` and a separator ends the prefix or follows it. */
function isStrictlyPrefixWithSeparator(value: string, prefix: string): boolean {
  if (value.length <= prefix.length || !ignoreCase(value).startsWith(ignoreCase(prefix))) return false;
  return prefix.length === 0 || !isUnreserved(prefix[prefix.length - 1]!) || !isUnreserved(value[prefix.length]!);
}

/** RFC 3986 unreserved characters: no component separators. */
function isUnreserved(ch: string): boolean {
  return /^[\p{L}\p{N}\-._~]$/u.test(ch);
}

function joinClasses(...classes: string[]): string {
  return classes.filter((c) => c.length > 0).join(" ");
}
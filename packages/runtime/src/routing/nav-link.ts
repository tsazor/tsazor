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
 *
 * Every other attribute goes onto the anchor, as in Blazor
 * (`CaptureUnmatchedValues`): `<NavLink class="nav-link" href="counter">`
 * renders `class="nav-link active"` while the link is active.
 */
export class NavLink extends ComponentBase {
  /** Target href: relative to the base URI ("counter"), root-relative ("/app/counter") or absolute. */
  @Parameter() href = "";
  /** Default is prefix matching (Blazor's default). */
  @Parameter() match: NavLinkMatch = NavLinkMatch.Prefix;
  /** Class added while active. */
  @Parameter() activeClass = "active";
  /**
   * Static classes always present on the anchor.
   * @deprecated Write `class="…"` as in Blazor; the active class joins it.
   */
  @Parameter() cssClass = "";
  /** Any other attribute (`class`, `target`, `title`, `aria-*` …) goes onto the anchor: Blazor's `AdditionalAttributes`. */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;
  /** Link content (markup between the NavLink tags). */
  @Parameter() childContent?: RenderFragment;

  private readonly navigation = this.inject(NavigationManager);
  private unsubscribe?: () => void;

  protected override onInitialized(): void {
    this.unsubscribe = this.navigation.addLocationChanged(() => this.stateHasChangedInternal());
  }

  /** Stops listening to location changes. */
  dispose(): void {
    this.unsubscribe?.();
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    // Hash routing (Tsazor extension) renders route hrefs as fragments (`#/orders`).
    const href = this.navigation.toLinkHref(this.href);
    const active = navLinkMatches(this.navigation.toAbsoluteUri(this.href), this.navigation.uri, this.match);
    const attributes = this.additionalAttributes ?? {};
    const userClass = typeof attributes["class"] === "string" ? attributes["class"] : "";
    b.openElement(0, "a");
    for (const [name, value] of Object.entries(attributes)) {
      if (name !== "class") b.addAttribute(1, name, value as never);
    }
    b.addAttribute(2, "href", href);
    // Blazor's CssClass: the class attribute and, while active, the active class; no attribute when both are empty.
    const cssClass = joinClasses(userClass, this.cssClass, active ? this.activeClass : "");
    if (cssClass !== "") b.addAttribute(3, "class", cssClass);
    if (active) b.addAttribute(4, "aria-current", "page");
    b.addContent(5, this.childContent);
    b.closeElement();
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
/**
 * Blazor's DomWrapper: `focusBySelector` is the JS interop used by
 * FocusOnNavigate (Web.JS DomWrapper.ts) — the element is marked
 * programmatically-focusable when it has no tabindex, then focused without
 * scrolling.
 */
export function focusBySelector(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) return;
  // If no explicit tabindex is defined, mark it as programmatically-focusable.
  // This adds an HTML attribute, but does not affect diffing: it diff only
  // deals with the attributes of the authoring code.
  if (!element.hasAttribute("tabindex")) {
    element.tabIndex = -1;
  }
  element.focus({ preventScroll: true });
}

/**
 * Blazor's scrollToElement (NavigationUtils.ts): the element with this id,
 * else the first with this name, scrolled into view. False when there is
 * none (or the identifier is empty).
 */
export function scrollToElement(identifier: string): boolean {
  if (!identifier) return false;
  let decoded = identifier;
  try {
    decoded = decodeURIComponent(identifier);
  } catch {
    // malformed escape: look the raw text up
  }
  const element = document.getElementById(decoded) ?? document.getElementsByName(decoded)[0];
  if (!element) return false;
  element.scrollIntoView();
  return true;
}

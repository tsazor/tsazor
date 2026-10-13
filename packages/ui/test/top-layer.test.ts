/**
 * F2: the overlays in the browser's top layer — `popover="manual"` + `showPopover()`, the popover's own box undone at
 * zero specificity, and the toasts that show themselves on top again. happy-dom has no Popover API: these tests give
 * it a minimal one (the shown elements in order), and check that without one nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hideFromTopLayer, raiseInTopLayer, topLayer } from "../src/index";

const shown: Element[] = [];
const matches = Element.prototype.matches;
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

function installPopoverApi(): void {
  proto.showPopover = function (this: HTMLElement) {
    if (shown.includes(this)) throw new Error("already shown");
    shown.push(this);
  };
  proto.hidePopover = function (this: HTMLElement) {
    shown.splice(shown.indexOf(this), 1);
  };
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ":popover-open" ? shown.includes(this) : matches.call(this, selector);
  };
}

function removePopoverApi(): void {
  delete proto.showPopover;
  delete proto.hidePopover;
  Element.prototype.matches = matches;
  shown.length = 0;
}

const element = (): HTMLElement => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  removePopoverApi();
  document.body.innerHTML = "";
});

describe("topLayer (F2)", () => {
  beforeEach(installPopoverApi);

  it("shows the element as a manual popover, marked for the box reset; the cleanup hides it", () => {
    const dialog = element();
    const cleanup = topLayer(dialog) as () => void;
    expect(dialog.getAttribute("popover")).toBe("manual");
    expect(dialog.hasAttribute("data-top-layer")).toBe(true);
    expect(shown).toEqual([dialog]);
    cleanup();
    expect(shown).toEqual([]);
  });

  it("stacks in the order shown: a menu opened in a dialog lies above it", () => {
    const dialog = element();
    const menu = element();
    topLayer(dialog);
    topLayer(menu);
    expect(shown).toEqual([dialog, menu]);
  });

  it("raises the toasts above an overlay shown after them — only then, so their animations don't replay", () => {
    const toasts = element();
    let since = raiseInTopLayer(toasts, 0);
    expect(shown).toEqual([toasts]);
    expect(raiseInTopLayer(toasts, since)).toBe(since); // nothing new: stays as it is
    const dialog = element();
    topLayer(dialog);
    since = raiseInTopLayer(toasts, since);
    expect(shown).toEqual([dialog, toasts]);
    hideFromTopLayer(toasts);
    expect(shown).toEqual([dialog]);
  });

  it("adopts the box reset once per document, at zero specificity", () => {
    if (!("adoptedStyleSheets" in document) || typeof CSSStyleSheet !== "function") return;
    topLayer(element());
    topLayer(element());
    const rules = document.adoptedStyleSheets.flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText));
    expect(rules.filter((rule) => rule.includes("[data-top-layer]"))).toHaveLength(1);
    expect(rules.find((rule) => rule.includes("[data-top-layer]"))).toMatch(/^:where\(\[data-top-layer\]\)/);
  });
});

describe("topLayer without the Popover API", () => {
  it("leaves the element as it is", () => {
    const dialog = element();
    expect(topLayer(dialog)).toBeUndefined();
    expect(dialog.hasAttribute("popover")).toBe(false);
    expect(raiseInTopLayer(dialog, 3)).toBe(3);
  });
});

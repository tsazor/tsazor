import { afterEach, describe, expect, it, vi } from "vitest";
import { anchoredPosition, createLayer, dismissible, focusTrap, rovingFocus, scrollLock, uniqueId } from "../src/index";
import { computePosition, FieldState } from "../src/kit";

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

function html(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.appendChild(host);
  return host;
}

const key = (target: EventTarget, name: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe("focusTrap", () => {
  it("moves focus in, wraps Tab at both edges and restores focus on cleanup", () => {
    const host = html(`<button id="opener">open</button><div id="dialog"><button id="a">a</button><input id="b"><button id="c" disabled>c</button></div>`);
    const opener = host.querySelector<HTMLElement>("#opener")!;
    opener.focus();
    const dialog = host.querySelector<HTMLElement>("#dialog")!;
    const cleanup = focusTrap()(dialog) as () => void;
    expect(document.activeElement?.id).toBe("a");

    host.querySelector<HTMLElement>("#b")!.focus();
    expect(key(document.activeElement!, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("a");
    expect(key(document.activeElement!, "Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("b");

    cleanup();
    expect(document.activeElement?.id).toBe("opener");
  });

  it("focuses the container when there is nothing focusable inside", () => {
    const host = html(`<div id="dialog"><p>Only text</p></div>`);
    const dialog = host.querySelector<HTMLElement>("#dialog")!;
    focusTrap()(dialog);
    expect(document.activeElement).toBe(dialog);
    expect(dialog.getAttribute("tabindex")).toBe("-1");
  });
});

describe("dismissible", () => {
  it("dismisses on Escape and on a press outside, ignoring listed elements", () => {
    const host = html(`<button id="toggle">t</button><ul id="menu"><li>x</li></ul><p id="away">away</p>`);
    const onDismiss = vi.fn();
    const menu = host.querySelector<HTMLElement>("#menu")!;
    const toggle = host.querySelector<HTMLElement>("#toggle")!;
    const cleanup = dismissible({ onDismiss, ignore: () => [toggle] })(menu) as () => void;

    menu.querySelector("li")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    toggle.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
    host.querySelector("#away")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    key(document.body, "Escape");
    expect(onDismiss.mock.calls).toEqual([["outside"], ["escape"]]);

    cleanup();
    key(document.body, "Escape");
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("lets only the topmost layer react", () => {
    const host = html(`<div id="dialog"><ul id="menu"></ul></div>`);
    const dialogDismiss = vi.fn();
    const menuDismiss = vi.fn();
    dismissible({ onDismiss: dialogDismiss })(host.querySelector<HTMLElement>("#dialog")!);
    const closeMenu = dismissible({ onDismiss: menuDismiss })(host.querySelector<HTMLElement>("#menu")!) as () => void;
    key(document.body, "Escape");
    expect([menuDismiss.mock.calls.length, dialogDismiss.mock.calls.length]).toEqual([1, 0]);
    closeMenu();
    key(document.body, "Escape");
    expect([menuDismiss.mock.calls.length, dialogDismiss.mock.calls.length]).toEqual([1, 1]);
  });
});

describe("layers", () => {
  it("a trap and a dismiss of one overlay share a layer; a menu inside still comes first", () => {
    const host = html(`<div id="dialog"><button id="a">a</button><input id="b"><ul id="menu"></ul></div>`);
    const dialog = host.querySelector<HTMLElement>("#dialog")!;
    const layer = createLayer();
    const dialogDismiss = vi.fn();
    focusTrap({ layer })(dialog);
    dismissible({ layer, onDismiss: dialogDismiss })(dialog);
    // The trap still wraps: the dismiss of the same overlay doesn't sit above it.
    host.querySelector<HTMLElement>("#b")!.focus();
    expect(key(document.activeElement!, "Tab").defaultPrevented).toBe(true);
    const closeMenu = dismissible({ onDismiss: vi.fn() })(host.querySelector<HTMLElement>("#menu")!) as () => void;
    key(document.body, "Escape");
    expect(dialogDismiss).not.toHaveBeenCalled();
    closeMenu();
    key(document.body, "Escape");
    expect(dialogDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("scrollLock", () => {
  it("counts nested locks", () => {
    const host = html(`<div id="a"></div><div id="b"></div>`);
    document.body.style.overflow = "auto";
    const first = scrollLock()(host.querySelector<HTMLElement>("#a")!) as () => void;
    const second = scrollLock()(host.querySelector<HTMLElement>("#b")!) as () => void;
    expect(document.body.style.overflow).toBe("hidden");
    first();
    expect(document.body.style.overflow).toBe("hidden");
    second();
    expect(document.body.style.overflow).toBe("auto");
  });
});

describe("rovingFocus", () => {
  it("moves with the arrows, wraps, jumps with Home/End and skips disabled items", () => {
    const host = html(`<div id="list"><button role="tab">One</button><button role="tab" disabled>Two</button><button role="tab">Three</button></div>`);
    const moves: number[] = [];
    rovingFocus({ items: "[role=tab]", onMove: (index) => moves.push(index) })(host.querySelector<HTMLElement>("#list")!);
    const tabs = [...host.querySelectorAll<HTMLElement>("[role=tab]")];
    tabs[0]!.focus();
    key(tabs[0]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);
    key(tabs[2]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
    key(tabs[0]!, "End");
    expect(document.activeElement).toBe(tabs[2]);
    expect(moves).toEqual([1, 0, 1]);
  });

  it("jumps by typed letters when typeahead is on", () => {
    const host = html(`<ul id="menu"><li role="menuitem" tabindex="-1">Copy</li><li role="menuitem" tabindex="-1">Paste</li><li role="menuitem" tabindex="-1">Print</li></ul>`);
    rovingFocus({ items: "[role=menuitem]", orientation: "vertical", typeahead: true })(host.querySelector<HTMLElement>("#menu")!);
    const items = [...host.querySelectorAll<HTMLElement>("[role=menuitem]")];
    items[0]!.focus();
    key(items[0]!, "p");
    expect(document.activeElement).toBe(items[1]);
    key(items[1]!, "p");
    expect(document.activeElement).toBe(items[2]);
  });
});

describe("anchoredPosition", () => {
  const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);

  it("computes the twelve placements", () => {
    const anchor = rect(100, 100, 50, 20);
    expect(computePosition(anchor, { width: 80, height: 40 }, "bottom-start", 4)).toEqual({ left: 100, top: 124 });
    expect(computePosition(anchor, { width: 80, height: 40 }, "top-end", 4)).toEqual({ left: 70, top: 56 });
    expect(computePosition(anchor, { width: 80, height: 40 }, "right", 4)).toEqual({ left: 154, top: 90 });
  });

  it("flips to the other side when the preferred one has no room", () => {
    const host = html(`<button id="anchor">a</button><ul id="menu"></ul>`);
    const anchor = host.querySelector<HTMLElement>("#anchor")!;
    const menu = host.querySelector<HTMLElement>("#menu")!;
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(rect(100, window.innerHeight - 30, 50, 20));
    Object.defineProperty(menu, "offsetWidth", { value: 80 });
    Object.defineProperty(menu, "offsetHeight", { value: 100 });
    anchoredPosition({ anchor: () => anchor })(menu);
    expect(menu.getAttribute("data-placement")).toBe("top-start");
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.top).toBe(`${window.innerHeight - 30 - 100 - 4}px`);
  });
});

describe("uniqueId", () => {
  it("is unique per call", () => {
    expect(uniqueId("tab")).not.toBe(uniqueId("tab"));
  });
});

describe("FieldState", () => {
  it("keeps one generated id and describes the input by help and message", () => {
    const field = new FieldState("tz-input");
    const id = field.id();
    expect(field.id()).toBe(id);
    expect(field.id("explicit")).toBe("explicit");
    expect(field.aria("", true)).toEqual({ "aria-invalid": undefined, "aria-describedby": `${id}-help` });
    expect(field.aria("Required", true)).toEqual({ "aria-invalid": "true", "aria-describedby": `${id}-help ${id}-message` });
  });

  it("reads Blazor's field classes: only a modified valid field is valid", () => {
    const field = new FieldState();
    expect(field.validity("valid")).toBe("none");
    expect(field.validity("modified valid")).toBe("valid");
    expect(field.validity("modified invalid")).toBe("invalid");
    expect(field.validity("invalid")).toBe("invalid");
  });
});

describe("focusTrap in Safari's click model", () => {
  it("returns focus to the pressed button when a click didn't focus it", () => {
    const host = html(`<button id="opener">open</button><div id="dialog"><button>ok</button></div>`);
    const trap = focusTrap();
    const opener = host.querySelector<HTMLElement>("#opener")!;
    // Safari: the press doesn't focus the button.
    opener.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    (document.activeElement as HTMLElement | null)?.blur();
    const cleanup = trap(host.querySelector<HTMLElement>("#dialog")!) as () => void;
    cleanup();
    expect(document.activeElement).toBe(opener);
  });
});

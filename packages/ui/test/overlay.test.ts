import { afterEach, describe, expect, it } from "vitest";
import { dismissable } from "../src/behaviors/dismissable.js";
import { overlayBackground, overlayBehavior, overlayClosesOn, type OverlayPress } from "../src/behaviors/overlay.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

function attach(element: HTMLElement, blocks: "page" | "region" | "none"): OverlayPress[] {
  const presses: OverlayPress[] = [];
  const cleanup = overlayBehavior({ blocks, onPress: (press) => presses.push(press) })(element);
  if (typeof cleanup === "function") cleanups.push(cleanup);
  return presses;
}

/** A page: a header with a button, and a card with a field and the overlay's place. */
function page(): { header: HTMLElement; save: HTMLButtonElement; card: HTMLElement; field: HTMLInputElement; overlay: HTMLElement; content: HTMLElement } {
  document.body.innerHTML = `
    <header><button id="save">Save</button></header>
    <main><section id="card"><input id="field"><div id="overlay"><div id="content"><span>Loading…</span></div></div></section></main>`;
  const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  return { header: document.querySelector("header")!, save: get("save"), card: get("card"), field: get("field"), overlay: get("overlay"), content: get("content") };
}

function key(name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

describe("overlayClosesOn", () => {
  it("closes on the clicks of its mode, and on Escape unless manual", () => {
    expect(overlayClosesOn("all", "inside")).toBe(true);
    expect(overlayClosesOn("all", "outside")).toBe(true);
    expect(overlayClosesOn("inside", "inside")).toBe(true);
    expect(overlayClosesOn("inside", "outside")).toBe(false);
    expect(overlayClosesOn("outside", "outside")).toBe(true);
    expect(overlayClosesOn("outside", "inside")).toBe(false);
    expect(overlayClosesOn("outside", "escape")).toBe(true);
    expect(overlayClosesOn("manual", "escape")).toBe(false);
    expect(overlayClosesOn("manual", "outside")).toBe(false);
  });
});

describe("overlayBackground", () => {
  it("mixes the color at the opacity, within 0–100", () => {
    expect(overlayBackground("#000", 40)).toBe("color-mix(in srgb, #000 40%, transparent)");
    expect(overlayBackground("var(--x)", 140)).toBe("color-mix(in srgb, var(--x) 100%, transparent)");
    expect(overlayBackground("red", Number.NaN)).toBe("color-mix(in srgb, red 0%, transparent)");
  });
});

describe("overlayBehavior", () => {
  it("over a region: the container's other content is inert, focus that was in it moves in and back", () => {
    const { header, field, overlay } = page();
    field.focus();
    attach(overlay, "region");
    expect(field.hasAttribute("inert")).toBe(true);
    expect(header.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(overlay);
    expect(overlay.tabIndex).toBe(-1);
    cleanups.pop()!();
    expect(field.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it("over a region: focus elsewhere stays where it is", () => {
    const { save, overlay } = page();
    save.focus();
    attach(overlay, "region");
    expect(document.activeElement).toBe(save);
  });

  it("over the page: everything else is inert, the page doesn't scroll, focus goes to the first control in it", () => {
    const { header, save, field, content, overlay } = page();
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    content.append(cancel);
    save.focus();
    attach(overlay, "page");
    expect(header.hasAttribute("inert")).toBe(true);
    expect(field.hasAttribute("inert")).toBe(true);
    expect(overlay.hasAttribute("inert")).toBe(false);
    expect(overlay.closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(cancel);
    cleanups.pop()!();
    expect(header.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(save);
  });

  it("makes content added meanwhile inert, and leaves inert what was inert before", async () => {
    const { card, field, overlay } = page();
    field.setAttribute("inert", "");
    attach(overlay, "region");
    const late = document.createElement("p");
    card.append(late);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(late.hasAttribute("inert")).toBe(true);
    cleanups.pop()!();
    expect(late.hasAttribute("inert")).toBe(false);
    expect(field.hasAttribute("inert")).toBe(true);
  });

  it("tells a click on the background from one on the content", () => {
    const { overlay, content } = page();
    const presses = attach(overlay, "region");
    overlay.click();
    content.querySelector("span")!.click();
    expect(presses).toEqual(["outside", "inside"]);
  });

  it("interactive: blocks nothing, and a press on the page is outside", () => {
    const { save, field, overlay } = page();
    field.focus();
    const presses = attach(overlay, "none");
    expect(field.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(field);
    save.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(presses).toEqual(["outside"]);
  });

  it("over the page: Escape reaches it before the dialog under it", () => {
    const { overlay } = page();
    let dialogDismissed = 0;
    const dialog = document.createElement("div");
    document.body.append(dialog);
    const detach = dismissable({ onDismiss: () => dialogDismissed++ })(dialog);
    if (typeof detach === "function") cleanups.push(detach);
    const presses = attach(overlay, "page");
    expect(key("Escape").defaultPrevented).toBe(true);
    expect(presses).toEqual(["escape"]);
    expect(dialogDismissed).toBe(0);
  });

  it("over a region: Escape reaches it only while it has the focus", () => {
    const { save, field, overlay } = page();
    let dialogDismissed = 0;
    const detach = dismissable({ onDismiss: () => dialogDismissed++ })(document.querySelector("main")!);
    if (typeof detach === "function") cleanups.push(detach);
    save.focus();
    const presses = attach(overlay, "region");
    key("Escape");
    expect(presses).toEqual([]);
    expect(dialogDismissed).toBe(1);
    overlay.tabIndex = -1;
    overlay.focus();
    key("Escape");
    expect(presses).toEqual(["escape"]);
    expect(dialogDismissed).toBe(1);
    save.focus();
    key("Escape");
    expect(presses).toEqual(["escape"]);
    expect(dialogDismissed).toBe(2);
  });
});

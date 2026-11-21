import { afterEach, describe, expect, it } from "vitest";
import { rovingFocus, startColumnResize, toolbarFocus } from "../src/index";
import { isRightToLeft, logicalArrowKey } from "../src/kit";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A host laid out right to left (happy-dom derives `direction` from the style, not from `dir`). */
function rightToLeft(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.style.direction = "rtl";
  host.innerHTML = markup;
  document.body.appendChild(host);
  return host;
}

const key = (target: Element, name: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

describe("right to left (WAI-ARIA APG: the horizontal arrows follow what the reader sees)", () => {
  it("swaps ArrowLeft and ArrowRight only in right to left, and only those two", () => {
    expect(logicalArrowKey("ArrowLeft", true)).toBe("ArrowRight");
    expect(logicalArrowKey("ArrowRight", true)).toBe("ArrowLeft");
    expect(logicalArrowKey("ArrowUp", true)).toBe("ArrowUp");
    expect(logicalArrowKey("ArrowLeft", false)).toBe("ArrowLeft");
    const host = rightToLeft("<span></span>");
    expect(isRightToLeft(host.firstElementChild!)).toBe(true);
    expect(isRightToLeft(document.body)).toBe(false);
  });

  it("tabs: ArrowLeft goes to the next tab, ArrowRight to the previous one", () => {
    const host = rightToLeft('<div id="list"><button role="tab">One</button><button role="tab">Two</button><button role="tab">Three</button></div>');
    rovingFocus({ items: "[role=tab]" })(host.querySelector<HTMLElement>("#list")!);
    const tabs = [...host.querySelectorAll<HTMLElement>("[role=tab]")];
    tabs[0]!.focus();
    key(tabs[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
    key(tabs[1]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("a vertical list keeps its keys", () => {
    const host = rightToLeft('<div id="menu"><button role="menuitem">One</button><button role="menuitem">Two</button></div>');
    rovingFocus({ items: "[role=menuitem]", orientation: "vertical" })(host.querySelector<HTMLElement>("#menu")!);
    const items = [...host.querySelectorAll<HTMLElement>("[role=menuitem]")];
    items[0]!.focus();
    key(items[0]!, "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
  });

  it("a toolbar: ArrowLeft goes to the next control", () => {
    const host = rightToLeft("<button>Bold</button><button>Italic</button><button>Link</button>");
    host.setAttribute("role", "toolbar");
    toolbarFocus()(host);
    const [bold, italic] = [...host.querySelectorAll<HTMLElement>("button")];
    bold!.focus();
    key(bold!, "ArrowLeft");
    expect(document.activeElement).toBe(italic);
  });

  it("a column's resize handle: moving left widens it (it sits at the column's left edge)", () => {
    const host = rightToLeft('<span class="handle"></span>');
    const handle = host.querySelector(".handle")!;
    const widths: number[] = [];
    const pointer = new PointerEvent("pointerdown", { clientX: 300, bubbles: true });
    Object.defineProperty(pointer, "target", { value: handle });
    const cleanup = startColumnResize({ pointer, initialWidth: 120, onResize: (width) => widths.push(width) });
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 260 }));
    cleanup();
    expect(widths).toEqual([160]);
  });
});

import { describe, expect, it } from "vitest";
import { icon } from "../src/index";
import { iconSize } from "../src/kit";

describe("icon()", () => {
  it("takes an SVG's inner markup, with the default 24px viewBox", () => {
    expect(icon("dot", '<circle cx="12" cy="12" r="4"/>')).toEqual({ name: "dot", viewBox: "0 0 24 24", content: '<circle cx="12" cy="12" r="4"/>' });
  });

  it("takes a whole <svg>: its viewBox, and its inner markup as the content", () => {
    const value = icon("bolt", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h14"/></svg>');
    expect(value).toEqual({ name: "bolt", viewBox: "0 0 16 16", content: '<path d="M1 1h14"/>' });
  });

  it("without a viewBox, a whole <svg>'s width and height make one", () => {
    expect(icon("box", '<svg width="20" height="20"><rect width="20" height="20"/></svg>').viewBox).toBe("0 0 20 20");
  });

  it("an explicit viewBox wins", () => {
    expect(icon("box", '<svg viewBox="0 0 16 16"><rect/></svg>', "0 0 32 32").viewBox).toBe("0 0 32 32");
  });
});

describe("iconSize()", () => {
  it("is the viewBox width, as Fluent UI Blazor sizes an icon by its own size", () => {
    expect(iconSize(icon("a", "<path/>", "0 0 20 20"))).toBe(20);
    expect(iconSize(icon("b", '<svg viewBox="0,0,16,16"><path/></svg>'))).toBe(16);
    expect(iconSize(icon("c", "<path/>"))).toBe(24);
  });

  it("is 16 when the viewBox has no width", () => {
    expect(iconSize({ name: "x", viewBox: "", content: "" })).toBe(16);
  });
});

describe("icon() with an outline icon", () => {
  it("keeps the root's fill and stroke on a <g>, so it isn't filled by the skins' currentColor", () => {
    const value = icon("angle", '<svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" d="m19 9-7 7-7-7"/></svg>');
    expect(value.content).toBe('<g fill="none"><path stroke="currentColor" stroke-width="2" d="m19 9-7 7-7-7"/></g>');
    const stroked = icon("x", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 6l12 12"/></svg>');
    expect(stroked.content).toBe('<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 6l12 12"/></g>');
  });

  it("reads width and height, not stroke-width, for a viewBox", () => {
    expect(icon("w", '<svg stroke-width="2" width="20" height="10"><path/></svg>').viewBox).toBe("0 0 20 10");
  });
});

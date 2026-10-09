import { describe, expect, it } from "vitest";
import { builtInIcons, icon } from "../src/index";

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

describe("builtInIcons", () => {
  it("has the skins' small stroke set, each with its own path", () => {
    const names = Object.keys(builtInIcons);
    expect(names).toContain("close");
    expect(names).toContain("download");
    expect(new Set(names.map((name) => builtInIcons[name]!.content)).size).toBe(names.length);
  });
});

import { describe, expect, it } from "vitest";
import { highlightFragments, highlightTerms } from "../src/highlight.js";

const marked = (fragments: ReturnType<typeof highlightFragments>): string =>
  fragments.map((fragment) => (fragment.highlighted ? `[${fragment.text}]` : fragment.text)).join("");

describe("highlightFragments", () => {
  it("marks every match, ignoring case by default", () => {
    expect(marked(highlightFragments("Rye bread and rye rolls", ["rye"]))).toBe("[Rye] bread and [rye] rolls");
    expect(marked(highlightFragments("Rye bread and rye rolls", ["rye"], { caseSensitive: true }))).toBe("Rye bread and [rye] rolls");
  });

  it("takes several terms, the longest first, and treats them as text (no regex)", () => {
    expect(marked(highlightFragments("sourdough and dough", ["dough", "sourdough"]))).toBe("[sourdough] and [dough]");
    expect(marked(highlightFragments("a+b (c) [d]", ["a+b", "(c)", "[d]"]))).toBe("[a+b] [(c)] [[d]]");
    expect(marked(highlightFragments("<b>bold</b>", ["<b>"]))).toBe("[<b>]bold</b>");
  });

  it("runs on to the end of the word with untilNextBoundary", () => {
    expect(marked(highlightFragments("Blazor and Blätterteig", ["bl"], { untilNextBoundary: true }))).toBe("[Blazor] and [Blätterteig]");
  });

  it("gives the text whole when there is nothing to find, nothing for no text", () => {
    expect(highlightFragments("Rye", [])).toEqual([{ text: "Rye", highlighted: false }]);
    expect(highlightFragments("Rye", ["", ""])).toEqual([{ text: "Rye", highlighted: false }]);
    expect(highlightFragments("", ["rye"])).toEqual([]);
  });
});

describe("highlightTerms", () => {
  it("splits at the delimiters (Fluent UI Blazor's), adds MudBlazor's list, drops empty terms", () => {
    expect(highlightTerms("rye, spelt;oat", " ,;")).toEqual(["rye", "spelt", "oat"]);
    expect(highlightTerms("rye spelt")).toEqual(["rye spelt"]);
    expect(highlightTerms("a-b", "-")).toEqual(["a", "b"]);
    expect(highlightTerms(undefined, "", ["rye", "oat"])).toEqual(["rye", "oat"]);
  });
});

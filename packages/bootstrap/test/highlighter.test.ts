/**
 * Highlighter, the Bootstrap skin (Fluent UI Blazor's FluentHighlighter, MudBlazor's MudHighlighter): the terms marked, split at the
 * delimiters, case, the end of the word, the text kept as text, attributes on each mark.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree, type RenderResult } from "@tsazor/testing";
import { Highlighter } from "../dist/index.js";

const MARK_CLASS = "tz-highlighter";
const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

async function highlight(attrs: Record<string, unknown>): Promise<HTMLElement> {
  const result = await renderTree((b) => {
    b.openElement(0, "p");
    b.openComponent(1, Highlighter);
    let seq = 2;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
    b.closeComponent();
    b.closeElement();
  });
  mounted.push(result);
  await result.settle();
  return result.container.querySelector("p")!;
}

const marks = (p: HTMLElement): string[] => [...p.querySelectorAll("mark")].map((mark) => mark.textContent ?? "");

describe("Highlighter", () => {
  it("marks the search text wherever it is, ignoring case", async () => {
    const p = await highlight({ text: "Rye bread and rye rolls", highlightedText: "rye" });
    expect(p.textContent).toBe("Rye bread and rye rolls");
    expect(marks(p)).toEqual(["Rye", "rye"]);
    expect(p.querySelector("mark")!.className).toBe(MARK_CLASS);
  });

  it("splits at the delimiters and takes MudBlazor's list of terms", async () => {
    const p = await highlight({ text: "Rye, spelt and oat flour", highlightedText: "rye spelt", delimiters: " ", highlightedTexts: ["flour"] });
    expect(marks(p)).toEqual(["Rye", "spelt", "flour"]);
  });

  it("caseSensitive and untilNextBoundary", async () => {
    expect(marks(await highlight({ text: "Rye and rye", highlightedText: "rye", caseSensitive: true }))).toEqual(["rye"]);
    expect(marks(await highlight({ text: "Sourdough loaves", highlightedText: "sour", untilNextBoundary: true }))).toEqual(["Sourdough"]);
  });

  it("keeps markup in the text as text, and puts attributes on each mark", async () => {
    const p = await highlight({ text: "<b>rye</b>", highlightedText: "rye", class: "hit", "data-term": "rye" });
    expect(p.querySelector("b")).toBeNull();
    expect(p.textContent).toBe("<b>rye</b>");
    const mark = p.querySelector("mark")!;
    expect(mark.className).toBe(`${MARK_CLASS} hit`);
    expect(mark.getAttribute("data-term")).toBe("rye");
  });

  it("shows the text unmarked without a search text", async () => {
    const p = await highlight({ text: "Rye bread" });
    expect(p.textContent).toBe("Rye bread");
    expect(marks(p)).toEqual([]);
  });
});

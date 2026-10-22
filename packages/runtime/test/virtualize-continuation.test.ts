/**
 * Virtualize, item by item (B44): an item that renders more than one element — a DataGrid row and its detail row —
 * marks the ones after its first `data-virtualize-continuation`; stepping by item skips them, and without the marker
 * every element is an item, as in Blazor.
 */
import { describe, expect, it } from "vitest";
import { firstItemElement, nextItemElement } from "../src/data/virtualize-viewport";

function rows(markup: string): { before: Element; after: Element } {
  const body = document.createElement("tbody");
  body.innerHTML = `<tr id="before"></tr>${markup}<tr id="after"></tr>`;
  return { before: body.querySelector("#before")!, after: body.querySelector("#after")! };
}

function itemIds(before: Element, after: Element): string[] {
  const ids: string[] = [];
  for (let el = firstItemElement(before, after); el && el !== after; el = nextItemElement(el, after)) ids.push(el.id);
  return ids;
}

describe("Virtualize's items", () => {
  it("are the elements between the spacers, one each, without the marker", () => {
    const { before, after } = rows(`<tr id="a"></tr><tr id="b"></tr><tr id="c"></tr>`);
    expect(itemIds(before, after)).toEqual(["a", "b", "c"]);
  });

  it("skip an item's continuation elements: a row with its detail row is one item", () => {
    const { before, after } = rows(`<tr id="a"></tr><tr id="a-detail" data-virtualize-continuation></tr><tr id="b"></tr><tr id="c"></tr><tr id="c-detail" data-virtualize-continuation></tr>`);
    expect(itemIds(before, after)).toEqual(["a", "b", "c"]);
  });

  it("start after a continuation the window begins with", () => {
    const { before, after } = rows(`<tr id="x-detail" data-virtualize-continuation></tr><tr id="b"></tr>`);
    expect(itemIds(before, after)).toEqual(["b"]);
  });
});

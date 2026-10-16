/**
 * The sheet's model: the A1 round-trips, the range's selection, the set's
 * steps (undo/redo), copy/paste (CSV-text shaped).
 */
import { describe, expect, it, vi } from "vitest";
import { SheetModel, parseAddress, formatAddress, columnNumber, formatColumn, rangeHolds } from "../src/index";

describe("the A1 round-trips", () => {
  it("parses and formats addresses; junk isn't one", () => {
    expect(parseAddress("B3")).toEqual({ column: "b", row: 3 });
    expect(formatAddress({ column: "b", row: 3 })).toBe("B3");
    expect(columnNumber("a")).toBe(0);
    expect(columnNumber("z")).toBe(25);
    expect(columnNumber("aa")).toBe(26);
    expect(formatColumn(26)).toBe("aa");
    expect(formatColumn(0)).toBe("a");
    expect(parseAddress("0")).toBeUndefined();
    expect(parseAddress("A0")).toBeUndefined();
  });
});

describe("the sheet", () => {
  it("sets and clears a cell; an equal set doesn't re-render", async () => {
    const onChange = vi.fn();
    const sheet = new SheetModel(onChange);
    await sheet.setAsync("B3", 12);
    expect(sheet.valueOf("B3")).toBe(12);
    expect(onChange).toHaveBeenCalledTimes(1);
    await sheet.setAsync("b3", 12);
    expect(onChange).toHaveBeenCalledTimes(1);
    await sheet.setAsync("B3", undefined);
    expect(sheet.valueOf("B3")).toBeUndefined();
  });

  it("counts the steps: undo writes the before back, redo the after", async () => {
    const sheet = new SheetModel(() => undefined);
    await sheet.setAsync("A1", "one");
    await sheet.setAsync("B3", 12);
    expect(sheet.canUndo).toBe(true);
    await sheet.undoAsync(); // B3's clear ("the set to 12" undoes)
    expect(sheet.valueOf("B3")).toBeUndefined();
    await sheet.undoAsync(); // A1's clear
    expect(sheet.valueOf("A1")).toBeUndefined();
    expect(sheet.canUndo).toBe(false);
    expect(sheet.canRedo).toBe(true);
    await sheet.redoAsync();
    expect(sheet.valueOf("A1")).toBe("one");
  });

  it("selects a range and reads its values; a single cell selects itself", async () => {
    const sheet = new SheetModel(() => undefined);
    await sheet.setAsync("B2", 4);
    await sheet.setAsync("C3", 6);
    sheet.select("B2", "C3");
    expect(sheet.isSelected("B2")).toBe(true);
    expect(sheet.isSelected("C3")).toBe(true);
    expect(sheet.isSelected("D3")).toBe(false);
    expect(sheet.selectedValues()).toEqual({
      addresses: ["B2", "C2", "B3", "C3"],
      values: [4, undefined, undefined, 6],
    });
    expect(rangeHolds({ from: parseAddress("B2")!, to: parseAddress("C3")! }, parseAddress("B3")!)).toBe(true);
  });

  it("copies a range and pastes it at a cell, keeping the shape", async () => {
    const sheet = new SheetModel(() => undefined);
    await sheet.setAsync("A1", 1);
    await sheet.setAsync("B1", "x");
    sheet.select("A1", "B1");
    sheet.copy();
    expect(sheet.canPaste).toBe(true);
    await sheet.pasteAsync("D4");
    expect(sheet.valueOf("D4")).toBe(1);
    expect(sheet.valueOf("E4")).toBe("x");
    expect(sheet.valueOf("D5")).toBeUndefined();
  });

  it("overwrites at the paste; the paste's own undo steps land in the stack", async () => {
    const sheet = new SheetModel(() => undefined);
    await sheet.setAsync("A1", 1);
    sheet.select("A1", "A1");
    sheet.copy();
    await sheet.setAsync("B9", "old");
    sheet.select("B9", "B9");
    sheet.copy();
    await sheet.pasteAsync("A1");
    expect(sheet.valueOf("A1")).toBe("old");
    await sheet.undoAsync();
    expect(sheet.valueOf("A1")).toBe(1);
  });
});
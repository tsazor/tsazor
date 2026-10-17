/**
 * The sheet's model: the A1 round-trips, the range's selection, the steps
 * (undo/redo; a paste is one), copy/paste of a range within the sheet.
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

  it("a paste is one step and one render: one undo takes the whole range back, one redo puts it again", async () => {
    const onChange = vi.fn();
    const sheet = new SheetModel(onChange);
    await sheet.setAsync("A1", 1);
    await sheet.setAsync("B1", 2);
    await sheet.setAsync("A2", 3);
    await sheet.setAsync("B2", 4);
    await sheet.setAsync("E2", "kept");
    sheet.select("A1", "B2");
    sheet.copy();
    onChange.mockClear();
    await sheet.pasteAsync("D1");
    expect(onChange).toHaveBeenCalledTimes(1);
    const pasted = () => ["D1", "E1", "D2", "E2"].map((address) => sheet.valueOf(address));
    expect(pasted()).toEqual([1, 2, 3, 4]);
    await sheet.undoAsync();
    expect(pasted()).toEqual([undefined, undefined, undefined, "kept"]);
    expect(sheet.valueOf("B2")).toBe(4);
    await sheet.redoAsync();
    expect(pasted()).toEqual([1, 2, 3, 4]);
  });

  it("a new step after an undo drops the undone ones; a { column, row } in capitals is the same cell", async () => {
    const sheet = new SheetModel(() => undefined);
    await sheet.setAsync("A1", "a");
    await sheet.setAsync("A2", "b");
    await sheet.undoAsync();
    await sheet.setAsync({ column: "C", row: 1 }, "c");
    expect(sheet.canRedo).toBe(false);
    expect(sheet.valueOf("C1")).toBe("c");
    await sheet.undoAsync();
    await sheet.undoAsync();
    expect([sheet.valueOf("A1"), sheet.valueOf("A2"), sheet.valueOf("C1")]).toEqual([undefined, undefined, undefined]);
    expect(sheet.canUndo).toBe(false);
  });

  it("stays linear over a long session: 20,000 sets in well under a second", async () => {
    const sheet = new SheetModel(() => undefined);
    const start = performance.now();
    for (let row = 1; row <= 20_000; row++) await sheet.setAsync({ column: "a", row }, row);
    expect(performance.now() - start).toBeLessThan(500);
    expect(sheet.valueOf("A20000")).toBe(20_000);
  });
});
import { describe, expect, it } from "vitest";
import { nextChipSelection } from "../src/index";

describe("nextChipSelection (MudBlazor's SelectionMode)", () => {
  it("single keeps one chip, and a click on it keeps it", () => {
    expect(nextChipSelection("single", [], "a")).toEqual(["a"]);
    expect(nextChipSelection("single", ["a"], "b")).toEqual(["b"]);
    expect(nextChipSelection("single", ["a"], "a")).toEqual(["a"]);
  });

  it("toggle is one chip or none", () => {
    expect(nextChipSelection("toggle", ["a"], "a")).toEqual([]);
    expect(nextChipSelection("toggle", ["a"], "b")).toEqual(["b"]);
  });

  it("multiple adds and removes; none never changes", () => {
    expect(nextChipSelection("multiple", ["a"], "b")).toEqual(["a", "b"]);
    expect(nextChipSelection("multiple", ["a", "b"], "a")).toEqual(["b"]);
    expect(nextChipSelection("none", ["a"], "b")).toEqual(["a"]);
  });

  it("compares with the set's comparer", () => {
    const byId = (x: { id: number }, y: { id: number }) => x.id === y.id;
    expect(nextChipSelection("multiple", [{ id: 1 }], { id: 1 }, byId)).toEqual([]);
  });
});

describe("ChipSetModel", () => {
  it("selects on a click, notifies the chips and reports to the set", async () => {
    const { ChipSetModel } = await import("../src/index");
    const model = new ChipSetModel<string>();
    model.mode = "multiple";
    const reported: string[][] = [];
    let notified = 0;
    model.onSelect = (values) => {
      reported.push(values);
    };
    model.subscribe(() => notified++);
    await model.click("a");
    await model.click("b");
    expect(model.isSelected("a") && model.isSelected("b")).toBe(true);
    expect(reported).toEqual([["a"], ["a", "b"]]);
    expect(notified).toBe(2);
    model.setSelected(["a", "b"]);
    expect(notified).toBe(2);
    model.setSelected(["b"]);
    expect(notified).toBe(3);
  });

  it("read-only and none change nothing; close reports the value and the index", async () => {
    const { ChipSetModel } = await import("../src/index");
    const model = new ChipSetModel<string>();
    model.readOnly = true;
    await model.click("a");
    expect(model.selected).toEqual([]);
    model.readOnly = false;
    model.mode = "none";
    await model.click("a");
    expect(model.selected).toEqual([]);
    const closed: string[] = [];
    model.onClose = (value) => {
      closed.push(value);
    };
    await model.close("a", 2);
    expect(closed).toEqual(["a"]);
    expect(model.focusAfterClose).toBe(2);
  });
});

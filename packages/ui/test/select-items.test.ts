/** A native select over typed options: the option's index as its value, mapped back to the option itself. */
import { describe, expect, it } from "vitest";
import { optionAtValue, selectedOptionIndex } from "../src/select-items";

describe("select items", () => {
  const brands = [{ id: 1, name: "Rye" }, { id: 2, name: "Wheat" }];
  const byName = (brand: { name: string }) => brand.name;

  it("finds the chosen option by identity, else by its key; -1 for none", () => {
    expect(selectedOptionIndex(brands, brands[1], byName)).toBe(1);
    expect(selectedOptionIndex(brands, { id: 2, name: "Wheat" }, byName)).toBe(1);
    expect(selectedOptionIndex(brands, { id: 3, name: "Spelt" }, byName)).toBe(-1);
    expect(selectedOptionIndex(brands, null, byName)).toBe(-1);
    expect(selectedOptionIndex([0, 1, 3], 3, String)).toBe(2);
  });

  it("maps a native value back to its option; '' and unknown values are null", () => {
    expect(optionAtValue(brands, "0")).toBe(brands[0]);
    expect(optionAtValue(brands, "")).toBeNull();
    expect(optionAtValue(brands, "7")).toBeNull();
    expect(optionAtValue(brands, "x")).toBeNull();
  });
});

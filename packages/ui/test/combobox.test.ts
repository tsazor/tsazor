import { describe, expect, it } from "vitest";
import { SearchRunner, comboboxKeyAction, filterOptions, toggleOption } from "../src/combobox";

describe("SearchRunner: the newest search wins", () => {
  it("aborts the search before and drops its late answer", async () => {
    const pending: Array<{ text: string; signal: AbortSignal; resolve: (options: string[]) => void }> = [];
    const runner = new SearchRunner<string>((text, signal) => new Promise((resolve) => pending.push({ text, signal, resolve })));
    const first = runner.runAsync("re");
    const second = runner.runAsync("red");
    expect(pending[0]!.signal.aborted).toBe(true);
    expect(pending[1]!.signal.aborted).toBe(false);
    // The older answer arrives last: it is dropped.
    pending[1]!.resolve(["red"]);
    pending[0]!.resolve(["red", "green"]);
    expect(await second).toEqual(["red"]);
    expect(await first).toBeUndefined();
  });

  it("treats a rejection of an aborted search as overtaken, and passes other errors on", async () => {
    const runner = new SearchRunner<string>((text, signal) =>
      new Promise((resolve, reject) => {
        if (text === "boom") reject(new Error("server down"));
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        setTimeout(() => resolve([text]), 5);
      }),
    );
    const overtaken = runner.runAsync("a");
    const latest = runner.runAsync("ab");
    expect(await overtaken).toBeUndefined();
    expect(await latest).toEqual(["ab"]);
    await expect(runner.runAsync("boom")).rejects.toThrow("server down");
  });

  it("takes a synchronous search too, and cancel aborts the one in flight", async () => {
    expect(await new SearchRunner<number>((text) => [text.length]).runAsync("abc")).toEqual([3]);
    let signal: AbortSignal | undefined;
    const runner = new SearchRunner<string>((_, s) => {
      signal = s;
      return new Promise(() => undefined);
    });
    void runner.runAsync("x");
    runner.cancel();
    expect(signal!.aborted).toBe(true);
  });
});

describe("the combobox's keyboard and selection", () => {
  const state = { open: true, active: 1, count: 3, inputEmpty: false, multiple: false };

  it("opens and moves with the arrows (wrapping), jumps with Home/End, selects with Enter, closes with Escape", () => {
    expect(comboboxKeyAction("ArrowDown", { ...state, open: false })).toEqual({ kind: "open", active: 0 });
    expect(comboboxKeyAction("ArrowUp", { ...state, open: false })).toEqual({ kind: "open", active: 2 });
    expect(comboboxKeyAction("ArrowDown", { ...state, active: 2 })).toEqual({ kind: "move", active: 0 });
    expect(comboboxKeyAction("ArrowUp", { ...state, active: 0 })).toEqual({ kind: "move", active: 2 });
    expect(comboboxKeyAction("End", state)).toEqual({ kind: "move", active: 2 });
    expect(comboboxKeyAction("Enter", state)).toEqual({ kind: "select", index: 1 });
    expect(comboboxKeyAction("Enter", { ...state, active: -1 })).toEqual({ kind: "none" });
    expect(comboboxKeyAction("Escape", state)).toEqual({ kind: "close" });
    expect(comboboxKeyAction("ArrowDown", { ...state, count: 0 })).toEqual({ kind: "none" });
  });

  it("removes the last value with Backspace in an empty input, only with several values", () => {
    expect(comboboxKeyAction("Backspace", { ...state, inputEmpty: true, multiple: true })).toEqual({ kind: "remove-last" });
    expect(comboboxKeyAction("Backspace", { ...state, inputEmpty: true })).toEqual({ kind: "none" });
    expect(comboboxKeyAction("Backspace", { ...state, multiple: true })).toEqual({ kind: "none" });
  });

  it("filters by text, ignoring case", () => {
    expect(filterOptions(["Red", "green", "Blue"], "RE", (o) => o)).toEqual(["Red", "green"]);
    expect(filterOptions(["a", "b"], "  ", (o) => o)).toEqual(["a", "b"]);
  });

  it("adds, removes and caps values, or replaces the one", () => {
    const key = (o: { id: number }) => o.id;
    const a = { id: 1 };
    const b = { id: 2 };
    expect(toggleOption([a], b, { multiple: true, key })).toEqual([a, b]);
    expect(toggleOption([a, b], { id: 1 }, { multiple: true, key })).toEqual([b]);
    expect(toggleOption([a], b, { multiple: true, maximum: 1, key })).toEqual([a]);
    expect(toggleOption([a], b, { multiple: false, key })).toEqual([b]);
  });
});

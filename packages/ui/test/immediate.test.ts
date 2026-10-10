import { afterEach, describe, expect, it, vi } from "vitest";
import { ImmediateInput } from "../src/index";

afterEach(() => {
  vi.useRealTimers();
});

function typeInto(field: HTMLInputElement, immediate: ImmediateInput, text: string, applied: string[], delay = 200): void {
  field.value = text;
  const event = new Event("input");
  Object.defineProperty(event, "target", { value: field });
  immediate.input(event, delay, (value) => applied.push(value));
}

describe("ImmediateInput (Fluent UI Blazor's Immediate)", () => {
  it("applies the field's value once the typing pauses, one update for a burst", () => {
    vi.useFakeTimers();
    const field = document.createElement("input");
    const immediate = new ImmediateInput();
    const applied: string[] = [];
    typeInto(field, immediate, "s", applied);
    vi.advanceTimersByTime(150);
    typeInto(field, immediate, "sa", applied);
    vi.advanceTimersByTime(150);
    typeInto(field, immediate, "sav", applied);
    expect(applied).toEqual([]);
    expect(immediate.pending).toBe(true);
    vi.advanceTimersByTime(200);
    expect(applied).toEqual(["sav"]);
    expect(immediate.pending).toBe(false);
  });

  it("carries the value when the pause ends, not the one of the last event", () => {
    vi.useFakeTimers();
    const field = document.createElement("input");
    const immediate = new ImmediateInput();
    const applied: string[] = [];
    typeInto(field, immediate, "ab", applied, 0);
    field.value = "abc";
    vi.advanceTimersByTime(0);
    expect(applied).toEqual(["abc"]);
  });

  it("a change or the component's disposal drops the pending update", () => {
    vi.useFakeTimers();
    const field = document.createElement("input");
    const controller = new AbortController();
    const immediate = new ImmediateInput(controller.signal);
    const applied: string[] = [];
    typeInto(field, immediate, "a", applied);
    immediate.cancel();
    vi.advanceTimersByTime(500);
    typeInto(field, immediate, "b", applied);
    controller.abort();
    vi.advanceTimersByTime(500);
    expect(applied).toEqual([]);
  });
});

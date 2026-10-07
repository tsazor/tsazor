import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, tooltip } from "../src/index";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("Toaster", () => {
  it("shows, notifies, closes itself after the timeout and pauses while hovered", () => {
    const toaster = new Toaster();
    const changes = vi.fn();
    toaster.subscribe(changes);
    const id = toaster.show({ title: "Saved", intent: "success", timeout: 3000 });
    expect(toaster.toasts.map((toast) => [toast.title, toast.intent])).toEqual([["Saved", "success"]]);
    vi.advanceTimersByTime(1000);
    toaster.pause(id);
    vi.advanceTimersByTime(10_000);
    expect(toaster.toasts).toHaveLength(1);
    toaster.resume(id);
    vi.advanceTimersByTime(2000);
    expect(toaster.toasts).toHaveLength(0);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("keeps a toast with timeout 0 until it is dismissed", () => {
    const toaster = new Toaster();
    const id = toaster.show({ message: "Offline", intent: "danger", timeout: 0 });
    vi.advanceTimersByTime(60_000);
    expect(toaster.toasts).toHaveLength(1);
    toaster.dismiss(id);
    expect(toaster.toasts).toHaveLength(0);
  });
});

describe("tooltip", () => {
  it("returns the same attachment for the same text (no re-attach per render)", () => {
    expect(tooltip("Save")).toBe(tooltip("Save"));
    expect(tooltip("Save")).not.toBe(tooltip("Save", { placement: "bottom" }));
  });

  it("describes the element, shows on focus and hover, hides on Escape and blur", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-describedby", "hint");
    document.body.append(button);
    const cleanup = tooltip("Save the order")(button) as () => void;
    const id = button.getAttribute("aria-describedby")!.split(" ")[1]!;
    expect(button.getAttribute("aria-describedby")).toBe(`hint ${id}`);

    button.dispatchEvent(new FocusEvent("focusin"));
    const tip = document.getElementById(id)!;
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.textContent).toBe("Save the order");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.getElementById(id)).toBeNull();

    button.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(300);
    expect(document.getElementById(id)).not.toBeNull();
    button.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(100);
    expect(document.getElementById(id)).toBeNull();

    cleanup();
    expect(button.getAttribute("aria-describedby")).toBe("hint");
  });
});

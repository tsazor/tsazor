import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, dismissible, tooltip } from "../src/index";

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

  it("keeps a toast with an action until it is closed, unless it names a timeout", () => {
    const toaster = new Toaster();
    toaster.show({ message: "Hi from John", action: { label: "Chat?", onClick: () => undefined } });
    toaster.show({ message: "Undo?", action: { label: "Undo", onClick: () => undefined }, timeout: 3000 });
    vi.advanceTimersByTime(60_000);
    expect(toaster.toasts.map((toast) => toast.message)).toEqual(["Hi from John"]);
  });

  it("runs a toast's action and closes it (MudBlazor's snackbar Action: \"Chat?\" opens the chat)", async () => {
    const toaster = new Toaster();
    const opened: string[] = [];
    const id = toaster.show({ message: "Hi from John", action: { label: "Chat?", onClick: () => void opened.push("chat/john") } });
    expect(toaster.toasts[0]!.action?.label).toBe("Chat?");

    await toaster.actAsync(id);

    expect(opened).toEqual(["chat/john"]);
    expect(toaster.toasts).toHaveLength(0);
    // A toast without an action, or one that is gone, does nothing.
    await toaster.actAsync(toaster.show({ message: "Saved" }));
    await toaster.actAsync(id);
    expect(opened).toHaveLength(1);
    expect(toaster.toasts).toHaveLength(1);
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

    // The description is there before any focus or hover: browse mode reads it without focusing.
    const tip = document.getElementById(id)!;
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.textContent).toBe("Save the order");
    expect(tip.hidden).toBe(true);

    button.dispatchEvent(new FocusEvent("focusin"));
    expect(tip.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tip.hidden).toBe(true);

    button.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(300);
    expect(tip.hidden).toBe(false);
    button.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(100);
    expect(tip.hidden).toBe(true);
    expect(document.getElementById(id)).toBe(tip);

    cleanup();
    expect(document.getElementById(id)).toBeNull();
    expect(button.getAttribute("aria-describedby")).toBe("hint");
  });

  it("takes Escape ahead of the dialog it sits in: the first closes the tooltip, the next the dialog", () => {
    const dialog = document.createElement("div");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    const reasons: string[] = [];
    // The dialog listens first, as it opened first.
    const closeDialog = dismissible({ onDismiss: (reason) => reasons.push(reason) })(dialog) as () => void;
    const cleanup = tooltip("Delete the order")(button) as () => void;
    const tip = document.getElementById(button.getAttribute("aria-describedby")!)!;

    button.focus();
    button.dispatchEvent(new FocusEvent("focusin"));
    const escape = (): boolean => button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    escape();
    expect(tip.hidden).toBe(true);
    expect(reasons).toEqual([]);
    escape();
    expect(reasons).toEqual(["escape"]);

    cleanup();
    closeDialog();
  });
});

import { describe, expect, it } from "vitest";
import { ariaKeyShortcuts, hotkeyApplies, isTypingTarget, matchesHotkey, parseHotkey } from "../src/hotkeys.js";

const keydown = (key: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("parseHotkey", () => {
  it("reads the modifiers in any order and case, and the key", () => {
    expect(parseHotkey("Ctrl+Shift+K", false)).toEqual({ key: "K", ctrl: true, alt: false, shift: true, meta: false });
    expect(parseHotkey("shift + alt + ArrowUp", false)).toEqual({ key: "ArrowUp", ctrl: false, alt: true, shift: true, meta: false });
    expect(parseHotkey("Escape", false)).toEqual({ key: "Escape", ctrl: false, alt: false, shift: false, meta: false });
    expect(parseHotkey("Ctrl+Plus", false)?.key).toBe("+");
    expect(parseHotkey("Space", false)?.key).toBe(" ");
  });

  it("Mod is Cmd on Apple devices and Ctrl elsewhere", () => {
    expect(parseHotkey("Mod+S", true)).toMatchObject({ meta: true, ctrl: false });
    expect(parseHotkey("Mod+S", false)).toMatchObject({ meta: false, ctrl: true });
    expect(parseHotkey("Cmd+S", false)).toMatchObject({ meta: true });
  });

  it("refuses text without a key or with two", () => {
    expect(parseHotkey("Ctrl+Shift", false)).toBeUndefined();
    expect(parseHotkey("a+b", false)).toBeUndefined();
    expect(parseHotkey("", false)).toBeUndefined();
  });
});

describe("matchesHotkey", () => {
  it("needs exactly the written modifiers", () => {
    const save = parseHotkey("Ctrl+S", false)!;
    expect(matchesHotkey(keydown("s", { ctrlKey: true }), save)).toBe(true);
    expect(matchesHotkey(keydown("S", { ctrlKey: true }), save)).toBe(true);
    expect(matchesHotkey(keydown("s"), save)).toBe(false);
    expect(matchesHotkey(keydown("s", { ctrlKey: true, altKey: true }), save)).toBe(false);
    expect(matchesHotkey(keydown("S", { ctrlKey: true, shiftKey: true }), save)).toBe(false);
  });

  it("a key that needs Shift to be typed matches whatever Shift is; a letter doesn't", () => {
    expect(matchesHotkey(keydown("?", { shiftKey: true }), parseHotkey("?", false)!)).toBe(true);
    expect(matchesHotkey(keydown("/"), parseHotkey("Shift+/", false)!)).toBe(false);
    expect(matchesHotkey(keydown("G", { shiftKey: true }), parseHotkey("g", false)!)).toBe(false);
    expect(matchesHotkey(keydown("G", { shiftKey: true }), parseHotkey("Shift+G", false)!)).toBe(true);
    expect(matchesHotkey(keydown("Escape"), parseHotkey("Escape", false)!)).toBe(true);
  });
});

describe("where a hotkey acts", () => {
  it("a plain key not while someone types; a combination with Ctrl, Alt or Meta everywhere", () => {
    const field = document.createElement("input");
    const box = document.createElement("input");
    box.type = "checkbox";
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "");
    const inner = document.createElement("span");
    editor.append(inner);
    expect(isTypingTarget(field)).toBe(true);
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(inner)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(hotkeyApplies(field, parseHotkey("?", false)!)).toBe(false);
    expect(hotkeyApplies(field, parseHotkey("?", false)!, true)).toBe(true);
    expect(hotkeyApplies(field, parseHotkey("Ctrl+K", false)!)).toBe(true);
    expect(hotkeyApplies(document.body, parseHotkey("?", false)!)).toBe(true);
  });

  it("writes the combination as aria-keyshortcuts does", () => {
    expect(ariaKeyShortcuts(parseHotkey("Ctrl+Shift+k", false)!)).toBe("Control+Shift+K");
    expect(ariaKeyShortcuts(parseHotkey("Mod+S", true)!)).toBe("Meta+S");
    expect(ariaKeyShortcuts(parseHotkey("Escape", false)!)).toBe("Escape");
  });
});

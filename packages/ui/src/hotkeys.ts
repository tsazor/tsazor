/**
 * Keyboard shortcuts (MudBlazor's MudHotkey, Fluent UI Blazor's FluentKeyCode): a combination written as text —
 * "Ctrl+K", "Mod+S" (Cmd on Apple devices, Ctrl elsewhere), "Shift+?", "Escape" — matched against a keydown.
 */

/** A parsed combination: the key and the modifiers that must be down (the others must be up). */
export interface Hotkey {
  readonly key: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

const MODIFIERS = new Set(["ctrl", "control", "alt", "option", "shift", "meta", "cmd", "command", "mod"]);

/** Whether the page runs on an Apple device, where "Mod" is the Command key. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * "Ctrl+Shift+K" as a Hotkey. The parts are separated by "+" (a "+" key itself is written "Plus"), modifiers in any
 * order and case; the key is a KeyboardEvent.key ("k", "Enter", "ArrowUp", "?", "/"). Undefined for text without a key.
 */
export function parseHotkey(text: string, apple = isApplePlatform()): Hotkey | undefined {
  const parts = text.split("+").map((part) => part.trim()).filter((part) => part !== "");
  let key: string | undefined;
  const hotkey = { ctrl: false, alt: false, shift: false, meta: false };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!MODIFIERS.has(lower)) {
      if (key !== undefined) return undefined;
      key = lower === "plus" ? "+" : lower === "space" ? " " : part;
      continue;
    }
    if (lower === "ctrl" || lower === "control") hotkey.ctrl = true;
    else if (lower === "alt" || lower === "option") hotkey.alt = true;
    else if (lower === "shift") hotkey.shift = true;
    else if (lower === "mod") hotkey[apple ? "meta" : "ctrl"] = true;
    else hotkey.meta = true;
  }
  return key === undefined ? undefined : { key, ...hotkey };
}

/**
 * Whether a keydown is the combination. Letters match in either case; with Shift written, "Shift+/" and "?" are
 * different combinations, but a key that needs Shift to be typed ("?") matches whatever Shift is.
 */
export function matchesHotkey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">, hotkey: Hotkey): boolean {
  if (event.ctrlKey !== hotkey.ctrl || event.altKey !== hotkey.alt || event.metaKey !== hotkey.meta) return false;
  const letter = hotkey.key.length === 1 && hotkey.key.toLowerCase() !== hotkey.key.toUpperCase();
  const shiftMatters = hotkey.shift || letter || hotkey.key.length > 1;
  if (shiftMatters && event.shiftKey !== hotkey.shift) return false;
  return letter || hotkey.key.length > 1 ? event.key.toLowerCase() === hotkey.key.toLowerCase() : event.key === hotkey.key;
}

/** Whether a key lands in something that takes typing (a text field, a select, an editable element). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[contenteditable]:not([contenteditable=false])") !== null) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(target.type);
}

/**
 * Whether a hotkey acts on a keydown that lands in `target`: always with Ctrl, Alt or Meta, or with
 * `inTextFields`; a plain key ("?", "g") not while someone types into a field.
 */
export function hotkeyApplies(target: EventTarget | null, hotkey: Hotkey, inTextFields = false): boolean {
  return inTextFields || hotkey.ctrl || hotkey.alt || hotkey.meta || !isTypingTarget(target);
}

/** The combination as `aria-keyshortcuts` writes it ("Control+K", "Meta+S"). */
export function ariaKeyShortcuts(hotkey: Hotkey): string {
  const key = hotkey.key === " " ? "Space" : hotkey.key === "+" ? "Plus" : hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
  return [hotkey.ctrl && "Control", hotkey.alt && "Alt", hotkey.shift && "Shift", hotkey.meta && "Meta", key].filter(Boolean).join("+");
}

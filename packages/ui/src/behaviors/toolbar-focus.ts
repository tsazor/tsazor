import type { Attachment } from "@tsazor/runtime";
import { focusElement } from "../focus.js";
import type { Orientation } from "../vocabulary.js";

/** What a toolbar's arrow keys move between: its controls, but not those of a menu or a popup it opened. */
const CONTROLS = "button, a[href], input, select, textarea, [role=button], [role=checkbox], [role=radio], [role=switch]";
const NESTED = "[role=menu], [role=listbox], [role=dialog], [role=tooltip], [popover]";

/** Options of `toolbarFocus`. */
export interface ToolbarFocusOptions {
  /** Which arrow keys move: left and right (horizontal, the default) or up and down. */
  orientation?: Orientation;
}

/**
 * The WAI-ARIA toolbar pattern on any controls inside: the toolbar is one tab stop (its last focused control, the
 * first at the start), the arrow keys move between the controls and wrap, Home and End jump to the ends, and disabled
 * controls are skipped. It keeps the tabindex of the controls itself, so they can be any components (Buttons, a Menu's
 * toggle), and keeps it as they come and go. In a text field the arrow keys edit the text.
 */
export function toolbarFocus(options: ToolbarFocusOptions = {}): Attachment<HTMLElement> {
  return (toolbar) => {
    const horizontal = (options.orientation ?? "horizontal") === "horizontal";
    let current: HTMLElement | undefined;

    const controls = (): HTMLElement[] =>
      [...toolbar.querySelectorAll<HTMLElement>(CONTROLS)].filter(
        (control) =>
          control.closest(NESTED) === null
          && !(control as HTMLButtonElement).disabled
          && control.getAttribute("aria-disabled") !== "true",
      );

    /** One tab stop: the current control has tabindex 0, the others -1. */
    const arrange = (): void => {
      const all = controls();
      if (current === undefined || !all.includes(current)) current = all[0];
      for (const control of all) {
        const wanted = control === current ? "0" : "-1";
        if (control.getAttribute("tabindex") !== wanted) control.setAttribute("tabindex", wanted);
      }
    };

    const onFocusIn = (event: FocusEvent): void => {
      const target = event.target as HTMLElement;
      const all = controls();
      const control = all.find((item) => item === target || item.contains(target));
      if (control === undefined || control === current) return;
      current = control;
      arrange();
    };

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      if (target.closest(NESTED) !== null) return;
      const editing = target.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, [contenteditable=true]");
      const forward = horizontal ? "ArrowRight" : "ArrowDown";
      const backward = horizontal ? "ArrowLeft" : "ArrowUp";
      const all = controls();
      if (all.length === 0) return;
      const at = all.findIndex((item) => item === target || item.contains(target));
      let next: number;
      if (event.key === forward && !editing) next = (at + 1) % all.length;
      else if (event.key === backward && !editing) next = (at - 1 + all.length) % all.length;
      else if (event.key === "Home" && !editing) next = 0;
      else if (event.key === "End" && !editing) next = all.length - 1;
      else return;
      event.preventDefault();
      current = all[next];
      arrange();
      if (current !== undefined) focusElement(current);
    };

    // The controls render, re-render and come and go: keep one tab stop.
    const observer = new MutationObserver(() => arrange());
    observer.observe(toolbar, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
    toolbar.addEventListener("focusin", onFocusIn);
    toolbar.addEventListener("keydown", onKeydown);
    arrange();
    return () => {
      observer.disconnect();
      toolbar.removeEventListener("focusin", onFocusIn);
      toolbar.removeEventListener("keydown", onKeydown);
    };
  };
}

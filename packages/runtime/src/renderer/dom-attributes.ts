import { EventCallback } from "../components/event-callback.js";
import { EventHandlerFlags } from "../render-tree/frame-type.js";
import type { ComponentState } from "./component-state.js";
import type { DomJournal } from "./dom-journal.js";

/**
 * Attribute application (roadmap B3, review R10) — Blazor's BrowserRenderer
 * rules, extended where Tsazor passes JS values:
 *
 * - EventCallback / function ⇒ DOM listener, keyed by event name (`onclick` →
 *   `click`). A changed callback swaps the handler behind the SAME listener;
 *   any other value under that name (null/undefined/false or a removal
 *   included) removes the listener.
 * - Form state as DOM properties (the content attribute is only the default):
 *   `value` on input/textarea/select, `checked` on input, `selected` on
 *   option — plus the attribute for `checked`/`selected`. Removing `value`
 *   clears it. A `<select>` keeps its desired value and re-applies it once a
 *   matching `<option>` exists (options inserted later, by a child component,
 *   or changed afterwards).
 * - null / undefined / false ⇒ attribute absent; true ⇒ present (`""`).
 * - Other primitives ⇒ content attribute (as Blazor: `hidden=""`,
 *   `width="100%"`, `form`/`list` all keep attribute semantics).
 * - Objects ⇒ the DOM property when the element has a writable one (custom
 *   element properties, `srcObject`, …), else the attribute. Getter-only
 *   properties are never assigned; the decision never throws.
 *
 * With a journal, every change to an existing element is recorded for
 * rollback; elements built detached for an insertion pass null.
 */

/** Runs a DOM event's handler on behalf of the component that bound it. */
export interface EventHandlerHost {
  invokeEventHandler(state: ComponentState, callback: EventCallback<never>, event: Event): void;
}

interface EventHandlerRecord {
  readonly eventName: string;
  readonly host: EventHandlerHost;
  readonly state: ComponentState;
  callback: EventCallback<never>;
  flags: number;
  readonly listener: (event: Event) => void;
}

/**
 * Per-element applier state lives on the element itself, as Blazor's
 * `_blazorEvents_1` / `_blazorDeferredValue` do (a WeakMap would miss
 * elements a DOM implementation hands out behind a proxy, as happy-dom does
 * for `<select>`).
 */
const HANDLERS = Symbol("tsazor.handlers");
/** Desired value of a `<select>` (its `value` attribute), re-applied when its options change. */
const SELECT_VALUE = Symbol("tsazor.selectValue");

interface ElementState {
  [HANDLERS]?: Map<string, EventHandlerRecord>;
  [SELECT_VALUE]?: { readonly value: unknown };
}

const stateOf = (element: Element): ElementState => element as unknown as ElementState;

/**
 * Sets attribute `name` of `element` to `value` — the new value of a
 * SetAttribute edit, or null for a RemoveAttribute edit.
 */
export function setAttributeValue(
  host: EventHandlerHost,
  state: ComponentState,
  element: Element,
  name: string,
  value: unknown,
  flags: number,
  journal: DomJournal | null,
): void {
  if (value instanceof EventCallback || typeof value === "function") {
    // Unbound function: no owning component, so no automatic re-render.
    const callback = value instanceof EventCallback ? (value as EventCallback<never>) : EventCallback.unbound(value as (arg: never) => void | Promise<void>);
    setEventHandler(host, state, element, eventNameOf(name), callback, flags, journal);
    // The handler replaces an inline (string) handler previously set under
    // this name; a fresh element (no journal) cannot have one.
    if (journal !== null) removeAttribute(element, name, journal);
    return;
  }
  // Any other value replaces a handler bound under this name.
  if (stateOf(element)[HANDLERS] !== undefined) removeEventHandler(element, eventNameOf(name), journal);

  if (applyFormProperty(element, name, value, journal)) return;
  // Blazor's conditional-attribute semantics: null/undefined = absent
  // (`aria-label="@maybeUndefined"` never renders an empty attribute), and
  // booleans are minimized attributes.
  if (value === null || value === undefined || value === false) {
    removeAttribute(element, name, journal);
  } else if (value === true) {
    setAttribute(element, name, "", journal);
  } else if (typeof value !== "object" || !trySetProperty(element, name, value, journal)) {
    setAttribute(element, name, String(value), journal);
  }
}

/** Maps a markup attribute name (`onclick`, `onClick`) to the DOM event name (`click`). */
function eventNameOf(attributeName: string): string {
  return attributeName.length > 2 && (attributeName.charCodeAt(0) | 32) === 111 && (attributeName.charCodeAt(1) | 32) === 110
    ? attributeName.slice(2).toLowerCase()
    : attributeName;
}

/* ------------------------------------------------------------------ */
/* Plain attributes and properties                                     */
/* ------------------------------------------------------------------ */

function setAttribute(element: Element, name: string, text: string, journal: DomJournal | null): void {
  journal?.attribute(element, name);
  element.setAttribute(name, text);
}

function removeAttribute(element: Element, name: string, journal: DomJournal | null): void {
  if (journal !== null) {
    if (!element.hasAttribute(name)) return;
    journal.attribute(element, name);
  }
  element.removeAttribute(name);
}

/** Assigns a writable DOM property; false (never a throw) when there is none or it rejects the value. */
function trySetProperty(element: Element, name: string, value: unknown, journal: DomJournal | null): boolean {
  if (!isWritableProperty(element, name)) return false;
  try {
    journal?.property(element, name);
    (element as unknown as Record<string, unknown>)[name] = value;
    return true;
  } catch {
    return false;
  }
}

/** A setter or a writable data property somewhere on the prototype chain (`form`/`list` are getter-only). */
function isWritableProperty(target: object, name: string): boolean {
  for (let current: object | null = target; current !== null; current = Object.getPrototypeOf(current) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor !== undefined) return descriptor.set !== undefined || descriptor.writable === true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Form state: value / checked / selected                              */
/* ------------------------------------------------------------------ */

const isAbsent = (value: unknown): boolean => value === null || value === undefined || value === false;

/** Blazor's tryApplySpecialProperty; returns whether `name` was handled for this element. */
function applyFormProperty(element: Element, name: string, value: unknown, journal: DomJournal | null): boolean {
  switch (name) {
    case "value":
      return applyValue(element, value, journal);
    case "checked":
      if (element.tagName !== "INPUT") return false;
      setBooleanState(element, "checked", !isAbsent(value), journal);
      return true;
    case "selected":
      if (element.tagName !== "OPTION") return false;
      setBooleanState(element, "selected", !isAbsent(value), journal);
      return true;
    default:
      return false;
  }
}

/** Attribute (the default state) first, then the live property — the user may have changed it. */
function setBooleanState(element: Element, name: "checked" | "selected", on: boolean, journal: DomJournal | null): void {
  if (on) setAttribute(element, name, "", journal);
  else removeAttribute(element, name, journal);
  const target = element as unknown as Record<string, boolean>;
  if (target[name] !== on) {
    journal?.property(element, name);
    target[name] = on;
  }
}

function applyValue(element: Element, value: unknown, journal: DomJournal | null): boolean {
  switch (element.tagName) {
    case "INPUT":
    case "TEXTAREA": {
      const input = element as HTMLInputElement;
      let text: string;
      if (isAbsent(value)) {
        removeAttribute(input, "value", journal);
        // Checkboxes and radios fall back to their default ("on") value once
        // the attribute is gone; every other input is cleared.
        if (input.type === "checkbox" || input.type === "radio") return true;
        text = "";
      } else {
        text = value === true ? "" : String(value);
      }
      if (input.value !== text) {
        journal?.property(input, "value");
        input.value = text;
      }
      return true;
    }
    case "SELECT":
      setSelectValue(element as HTMLSelectElement, isAbsent(value) ? null : value, journal);
      return true;
    case "OPTION": {
      if (isAbsent(value)) removeAttribute(element, "value", journal);
      else setAttribute(element, "value", value === true ? "" : String(value), journal);
      const select = selectOf(element.parentNode);
      if (select !== null) syncSelectValue(select, journal);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Sets a select's desired value and applies it right away (Blazor: also when
 * no matching option exists yet — then nothing is selected until one is).
 * null clears both.
 */
function setSelectValue(select: HTMLSelectElement, value: unknown, journal: DomJournal | null): void {
  const state = stateOf(select);
  journal?.restore(state, restoreSelectValue, state[SELECT_VALUE]);
  state[SELECT_VALUE] = value === null ? undefined : { value };
  writeSelectValue(select, value, journal);
}

function restoreSelectValue(state: ElementState, saved: { readonly value: unknown } | undefined): void {
  state[SELECT_VALUE] = saved;
}

function writeSelectValue(select: HTMLSelectElement, value: unknown, journal: DomJournal | null): void {
  if (select.multiple && Array.isArray(value)) {
    // A multiple select's value is the list of selected option values.
    const values = (value as unknown[]).map(String);
    for (let i = 0; i < select.options.length; i++) {
      const option = select.options[i]!;
      const on = values.includes(option.value);
      if (option.selected !== on) {
        journal?.property(option, "selected");
        option.selected = on;
      }
    }
    return;
  }
  // Blazor's setSingleSelectElementValue: null has no option representation; "" is the closest.
  journal?.property(select, "selectedIndex");
  select.value = value === null || value === undefined ? "" : String(value);
}

/**
 * Re-applies a select's desired value after its options changed, once an
 * option with that value exists (Blazor's deferred select value — kept for
 * the element's lifetime here, so later option changes re-sync too).
 */
export function syncSelectValue(select: HTMLSelectElement, journal: DomJournal | null): void {
  const desired = stateOf(select)[SELECT_VALUE];
  if (desired === undefined) return;
  const value = desired.value;
  if (select.multiple && Array.isArray(value)) {
    writeSelectValue(select, value, journal);
    return;
  }
  const text = value === null || value === undefined ? "" : String(value);
  if (select.value === text) return;
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i]!.value === text) {
      writeSelectValue(select, text, journal);
      return;
    }
  }
}

/** The `<select>` whose options are the children of `node` (the select itself or an optgroup in it). */
export function selectOf(node: Node | null): HTMLSelectElement | null {
  if (node === null) return null;
  if (node.nodeName === "SELECT") return node as HTMLSelectElement;
  if (node.nodeName === "OPTGROUP" && node.parentNode?.nodeName === "SELECT") return node.parentNode as HTMLSelectElement;
  return null;
}

/* ------------------------------------------------------------------ */
/* Event handlers                                                      */
/* ------------------------------------------------------------------ */

function setEventHandler(
  host: EventHandlerHost,
  state: ComponentState,
  element: Element,
  eventName: string,
  callback: EventCallback<never>,
  flags: number,
  journal: DomJournal | null,
): void {
  const map = handlersOf(element);
  const existing = map.get(eventName);
  if (existing !== undefined) {
    // Same listener, new handler: no DOM listener churn per changed callback.
    journal?.restore(existing, restoreCallback, existing.callback);
    journal?.restore(existing, restoreFlags, existing.flags);
    existing.callback = callback;
    existing.flags = flags;
    return;
  }
  const record: EventHandlerRecord = {
    eventName,
    host,
    state,
    callback,
    flags,
    listener: (event: Event): void => {
      if (record.flags & EventHandlerFlags.PreventDefault) event.preventDefault();
      if (record.flags & EventHandlerFlags.StopPropagation) event.stopPropagation();
      record.host.invokeEventHandler(record.state, record.callback, event);
    },
  };
  journal?.restore(element, detachHandler, record);
  element.addEventListener(eventName, record.listener);
  map.set(eventName, record);
}

function removeEventHandler(element: Element, eventName: string, journal: DomJournal | null): void {
  const record = stateOf(element)[HANDLERS]?.get(eventName);
  if (record === undefined) return;
  journal?.restore(element, attachHandler, record);
  detachHandler(element, record);
}

function handlersOf(element: Element): Map<string, EventHandlerRecord> {
  const state = stateOf(element);
  return (state[HANDLERS] ??= new Map<string, EventHandlerRecord>());
}

function detachHandler(element: Element, record: EventHandlerRecord): void {
  element.removeEventListener(record.eventName, record.listener);
  stateOf(element)[HANDLERS]?.delete(record.eventName);
}

function attachHandler(element: Element, record: EventHandlerRecord): void {
  element.addEventListener(record.eventName, record.listener);
  handlersOf(element).set(record.eventName, record);
}

function restoreCallback(record: EventHandlerRecord, callback: EventCallback<never>): void {
  record.callback = callback;
}

function restoreFlags(record: EventHandlerRecord, flags: number): void {
  record.flags = flags;
}

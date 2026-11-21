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
  host: EventHandlerHost;
  state: ComponentState;
  /** null: no handler, only modifier flags (a listener-less preventDefault). */
  callback: EventCallback<never> | null;
  /** Flags passed along with the handler frame (`addEventHandler`). */
  flags: number;
  /** Flags set by `__internal_preventDefault_<event>` / `__internal_stopPropagation_<event>` attributes. */
  modifierFlags: number;
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
  const modifier = eventModifierOf(name);
  if (modifier !== null) {
    setEventModifier(host, state, element, modifier.eventName, modifier.flag, !isAbsent(value), journal);
    return;
  }
  if (value instanceof EventCallback || typeof value === "function") {
    // Unbound function: no owning component, so no automatic re-render.
    const callback = value instanceof EventCallback ? (value as EventCallback<never>) : EventCallback.unbound(value as (arg: never) => void | Promise<void>);
    const replaced = setEventHandler(host, state, element, eventNameOf(name), callback, flags, journal);
    // The handler replaces an inline (string) handler previously set under
    // this name; a fresh element (no journal) cannot have one, nor can one
    // that already had a handler (setting a string clears the handler).
    if (journal !== null && !replaced) removeAttribute(element, name, journal);
    return;
  }
  // Any other value replaces a handler bound under this name.
  if (stateOf(element)[HANDLERS] !== undefined) clearEventHandler(element, eventNameOf(name), journal);

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

const PREVENT_DEFAULT_PREFIX = "__internal_preventDefault_";
const STOP_PROPAGATION_PREFIX = "__internal_stopPropagation_";

/**
 * Blazor's event-modifier attributes (`@onclick:preventDefault="cond"` ⇒
 * `__internal_preventDefault_onclick`): a flag of the element's listener for
 * that event, not a DOM attribute. Returns null for any other name.
 */
function eventModifierOf(name: string): { eventName: string; flag: number } | null {
  if (name.length < 12 || name.charCodeAt(0) !== 95 /* _ */ || !name.startsWith("__internal_")) return null;
  if (name.startsWith(PREVENT_DEFAULT_PREFIX)) {
    return { eventName: eventNameOf(name.slice(PREVENT_DEFAULT_PREFIX.length)), flag: EventHandlerFlags.PreventDefault };
  }
  if (name.startsWith(STOP_PROPAGATION_PREFIX)) {
    return { eventName: eventNameOf(name.slice(STOP_PROPAGATION_PREFIX.length)), flag: EventHandlerFlags.StopPropagation };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Plain attributes and properties                                     */
/* ------------------------------------------------------------------ */

function setAttribute(element: Element, name: string, text: string, journal: DomJournal | null): void {
  journal?.attribute(element, name);
  writeAttribute(element, name, text);
}

/** E1: whether `style` attributes go through the CSSOM — `createTsazorApp({ strictCsp: true })`. */
let cssomStyles = false;

/** @internal Set by createTsazorApp's `strictCsp` option. */
export function useCssomStyles(enabled: boolean): void {
  cssomStyles = enabled;
}

/**
 * Writes an attribute. With `strictCsp`, `style` goes through the CSSOM
 * (`style.cssText`): a Content Security Policy whose `style-src` has no
 * 'unsafe-inline' blocks `setAttribute("style", …)` as an inline style, but
 * not the CSSOM. The browser then normalizes the attribute's text (and drops
 * declarations it can't parse), so by default the text stays as written
 * (Blazor), and test DOMs with a partial CSS parser keep every declaration.
 */
export function writeAttribute(element: Element, name: string, text: string): void {
  if (cssomStyles && name.length === 5 && name.toLowerCase() === "style" && "style" in element) {
    (element as HTMLElement).style.cssText = text;
    return;
  }
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

/**
 * Blazor's BrowserRenderer.normalizeInputValue: Chromium misbehaves when a time
 * value carries ":00" seconds, and without a `step` attribute any seconds part
 * is invalid — so the seconds are trimmed in both cases (`type` and `step` are
 * read as currently set, like Blazor).
 */
function normalizeInputValue(value: string, input: HTMLInputElement): string {
  switch (input.getAttribute("type")) {
    case "time":
      return value.length === 8 && (value.endsWith("00") || !input.hasAttribute("step")) ? value.substring(0, 5) : value;
    case "datetime-local":
      return value.length === 19 && (value.endsWith("00") || !input.hasAttribute("step")) ? value.substring(0, 16) : value;
    default:
      return value;
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
        if (element.tagName === "INPUT") text = normalizeInputValue(text, input);
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

/** Binds `callback` to `element`'s `eventName` listener; true when it replaced a handler (not just a modifier record). */
function setEventHandler(
  host: EventHandlerHost,
  state: ComponentState,
  element: Element,
  eventName: string,
  callback: EventCallback<never>,
  flags: number,
  journal: DomJournal | null,
): boolean {
  const existing = handlersOf(element).get(eventName);
  if (existing !== undefined) {
    const hadHandler = existing.callback !== null;
    // Same listener, new handler: no DOM listener churn per changed callback
    // (the record may exist for a modifier flag only).
    journal?.restore(existing, restoreHandler, { host: existing.host, state: existing.state, callback: existing.callback, flags: existing.flags });
    existing.host = host;
    existing.state = state;
    existing.callback = callback;
    existing.flags = flags;
    return hadHandler;
  }
  attachRecord(host, state, element, eventName, callback, flags, journal);
  return false;
}

/**
 * Turns a modifier flag of `eventName`'s listener on or off. A flag without a
 * handler still gets a listener (Blazor: `@onsubmit:preventDefault` alone
 * prevents the submit); the listener goes once neither remains.
 */
function setEventModifier(
  host: EventHandlerHost,
  state: ComponentState,
  element: Element,
  eventName: string,
  flag: number,
  on: boolean,
  journal: DomJournal | null,
): void {
  let record = stateOf(element)[HANDLERS]?.get(eventName);
  if (record === undefined) {
    if (!on) return;
    record = attachRecord(host, state, element, eventName, null, 0, journal);
  }
  const next = on ? record.modifierFlags | flag : record.modifierFlags & ~flag;
  if (next === record.modifierFlags) return;
  journal?.restore(record, restoreModifierFlags, record.modifierFlags);
  record.modifierFlags = next;
  if (next === 0 && record.callback === null) detachRecord(element, record, journal);
}

/** Removes the handler bound under `eventName`; modifier flags keep the listener. */
function clearEventHandler(element: Element, eventName: string, journal: DomJournal | null): void {
  const record = stateOf(element)[HANDLERS]?.get(eventName);
  if (record === undefined || record.callback === null) return;
  if (record.modifierFlags === 0) {
    detachRecord(element, record, journal);
    return;
  }
  journal?.restore(record, restoreHandler, { host: record.host, state: record.state, callback: record.callback, flags: record.flags });
  record.callback = null;
  record.flags = 0;
}

function attachRecord(
  host: EventHandlerHost,
  state: ComponentState,
  element: Element,
  eventName: string,
  callback: EventCallback<never> | null,
  flags: number,
  journal: DomJournal | null,
): EventHandlerRecord {
  const record: EventHandlerRecord = {
    eventName,
    host,
    state,
    callback,
    flags,
    modifierFlags: 0,
    listener: (event: Event): void => {
      const effective = record.flags | record.modifierFlags;
      if (effective & EventHandlerFlags.PreventDefault) event.preventDefault();
      if (effective & EventHandlerFlags.StopPropagation) event.stopPropagation();
      if (record.callback !== null) record.host.invokeEventHandler(record.state, record.callback, event);
    },
  };
  journal?.restore(element, detachHandler, record);
  element.addEventListener(eventName, record.listener);
  handlersOf(element).set(eventName, record);
  return record;
}

function detachRecord(element: Element, record: EventHandlerRecord, journal: DomJournal | null): void {
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

type HandlerSnapshot = Pick<EventHandlerRecord, "host" | "state" | "callback" | "flags">;

function restoreHandler(record: EventHandlerRecord, saved: HandlerSnapshot): void {
  record.host = saved.host;
  record.state = saved.state;
  record.callback = saved.callback;
  record.flags = saved.flags;
}

function restoreModifierFlags(record: EventHandlerRecord, flags: number): void {
  record.modifierFlags = flags;
}

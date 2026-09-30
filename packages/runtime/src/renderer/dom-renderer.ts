import { FrameType } from "../render-tree/frame-type.js";
import type { RenderTreeFrame } from "../render-tree/render-tree.js";
import { getFrameSubtreeLength } from "../render-tree/render-tree.js";
import { RenderTreeEditType, type RenderTreeEdit } from "../render-tree/diff.js";
import { EventCallback } from "../components/event-callback.js";
import type { ComponentState } from "./component-state.js";
import type { Renderer } from "./renderer.js";

/**
 * One level of the edit walk (Blazor's "current depth"): the logical children
 * of a component's root (between its markers) or of an element.
 */
interface Level {
  parent: Node;
  /** Node right before the first logical child (a component's start marker), or null: starts at parent.firstChild. */
  anchor: Node | null;
  /** Exclusive end of the level (a component's end marker), or null. */
  boundary: Node | null;
  /** Cursor: a logical child index and its first DOM node (the boundary when index = child count). */
  index: number;
  node: Node | null;
}

interface EventHandlerRecord {
  callback: EventCallback<never>;
  flags: number;
  listener: (event: Event) => void;
}

const elementHandlers = new WeakMap<Element, Map<string, EventHandlerRecord>>();

const COMMENT_NODE = 8;

/**
 * Start comment → end comment of logical children spanning several DOM nodes:
 * a child component's output (between its markers) and a markup block.
 * Everything else is one node per logical child.
 */
const logicalRangeEnds = new WeakMap<Node, Node>();

/**
 * Applies a diff's edit list to the real DOM (Blazor's BrowserRenderer). The
 * diff itself never touches the DOM; this walks the edits once, resolving
 * sibling indices against the live DOM with a forward cursor per level
 * (edits within a level are ordered by ascending sibling index).
 */
export class DomRenderer {
  constructor(private readonly renderer: Renderer) {}

  /**
   * @internal Runs a DOM event's handler for a listener bound while
   * rendering `state`: the invocation is tracked by this DomRenderer's own
   * renderer (waitUntilIdle), failures go to its error handler.
   */
  invokeEventHandler(state: ComponentState, callback: EventCallback<never>, event: Event): void {
    const invocation = callback
      .invokeAsync(event as never)
      .catch((error) => this.renderer.handleComponentError(error, state, "event"));
    this.renderer.track(invocation);
  }

  /** Applies the edits of one render pass of `state`; `frames` is its new render tree. */
  applyEdits(state: ComponentState, frames: RenderTreeFrame[], edits: RenderTreeEdit[]): void {
    const stack: Level[] = [];
    let level: Level = {
      parent: state.startMarker.parentNode!,
      anchor: state.startMarker,
      boundary: state.endMarker,
      index: 0,
      node: state.startMarker.nextSibling,
    };

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]!;
      switch (edit.type) {
        case RenderTreeEditType.PrependFrame: {
          const before = childAt(level, edit.siblingIndex);
          level.node = this.insertFrame(state, frames, edit.referenceFrameIndex, level.parent, before);
          break;
        }
        case RenderTreeEditType.RemoveFrame: {
          const node = childAt(level, edit.siblingIndex)!;
          const last = lastNodeOf(node);
          level.node = last.nextSibling;
          removeRange(node, last);
          break;
        }
        case RenderTreeEditType.SetAttribute:
          setAttributeFrame(this, state, childAt(level, edit.siblingIndex) as Element, frames[edit.referenceFrameIndex]!);
          break;
        case RenderTreeEditType.RemoveAttribute:
          removeAttributeByName(childAt(level, edit.siblingIndex) as Element, edit.removedAttributeName!);
          break;
        case RenderTreeEditType.UpdateText:
          childAt(level, edit.siblingIndex)!.nodeValue = String(frames[edit.referenceFrameIndex]!.textContent);
          break;
        case RenderTreeEditType.UpdateMarkup: {
          const node = childAt(level, edit.siblingIndex)!;
          const last = lastNodeOf(node);
          const before = last.nextSibling;
          removeRange(node, last);
          level.node = insertMarkup(frames[edit.referenceFrameIndex]!.markupContent!, level.parent, before);
          break;
        }
        case RenderTreeEditType.StepIn: {
          const element = childAt(level, edit.siblingIndex)!;
          stack.push(level);
          level = { parent: element, anchor: null, boundary: null, index: 0, node: element.firstChild };
          break;
        }
        case RenderTreeEditType.StepOut:
          level = stack.pop()!;
          break;
        case RenderTreeEditType.PermutationListEntry: {
          let end = i;
          while (edits[end]!.type !== RenderTreeEditType.PermutationListEnd) end++;
          permuteLogicalChildren(level, edits, i, end);
          i = end;
          break;
        }
        default:
          break;
      }
    }
  }

  /** @internal Replaces the slot-children map after a render pass. */
  commitSlotChildren(state: ComponentState): void {
    state.slotChildren.clear();
    for (const [key, value] of state.newSlotChildren) {
      state.slotChildren.set(key, value);
    }
    state.newSlotChildren.clear();
  }

  /** Inserts frame `index` (with its whole subtree) before `before`; returns its first DOM node. */
  private insertFrame(state: ComponentState, frames: RenderTreeFrame[], index: number, parent: Node, before: Node | null): Node {
    const frame = frames[index]!;
    switch (frame.frameType) {
      case FrameType.Element: {
        const element = document.createElement(frame.elementName!);
        applyAttributes(this, state, element, frame, frames, index);
        // Build the fresh subtree into the detached element first, then insert
        // the completed tree in one shot: mass creates then cost one insertion
        // per element instead of one per node (10k rows = ~3n insertBefore -> n).
        this.insertChildFrames(state, frames, attributeRunEnd(frames, index), index + getFrameSubtreeLength(frame), element);
        parent.insertBefore(element, before);
        return element;
      }
      case FrameType.Text: {
        const text = document.createTextNode(String(frame.textContent));
        parent.insertBefore(text, before);
        return text;
      }
      case FrameType.Markup:
        return insertMarkup(frame.markupContent!, parent, before);
      case FrameType.Component: {
        // Instantiated by the renderer from the diff's component list before the edits run.
        const child = state.newSlotChildren.get(index)!;
        parent.insertBefore(child.startMarker, before);
        parent.insertBefore(child.endMarker, before);
        logicalRangeEnds.set(child.startMarker, child.endMarker);
        return child.startMarker;
      }
      default:
        throw new Error(`Unexpected frame type ${frame.frameType as number} in PrependFrame.`);
    }
  }

  /** Appends the child frames [start, end) of a new element (regions flattened). */
  private insertChildFrames(state: ComponentState, frames: RenderTreeFrame[], start: number, end: number, parent: Element): void {
    let i = start;
    while (i < end) {
      const frame = frames[i]!;
      switch (frame.frameType) {
        case FrameType.Attribute:
        case FrameType.EventHandler:
          break;
        case FrameType.Region:
          this.insertChildFrames(state, frames, i + 1, i + getFrameSubtreeLength(frame), parent);
          break;
        case FrameType.ElementReferenceCapture:
          frame.elementReferenceCaptureAction?.(parent);
          break;
        default:
          this.insertFrame(state, frames, i, parent, null);
          break;
      }
      i += getFrameSubtreeLength(frame);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Logical children                                                    */
/* ------------------------------------------------------------------ */

/** Last DOM node of the logical child starting at `node`. */
function lastNodeOf(node: Node): Node {
  return node.nodeType === COMMENT_NODE ? (logicalRangeEnds.get(node) ?? node) : node;
}

function firstChildOf(level: Level): Node | null {
  return level.anchor !== null ? level.anchor.nextSibling : level.parent.firstChild;
}

/** First DOM node of logical child `siblingIndex` (the boundary when past the end); moves the cursor. */
function childAt(level: Level, siblingIndex: number): Node | null {
  let index = level.index;
  let node = level.node;
  if (siblingIndex < index) {
    index = 0;
    node = firstChildOf(level);
  }
  while (index < siblingIndex) {
    node = lastNodeOf(node!).nextSibling;
    index++;
  }
  level.index = index;
  level.node = node;
  return node;
}

/** Removes the DOM nodes first..last (inclusive siblings). */
function removeRange(first: Node, last: Node): void {
  const parent = first.parentNode!;
  let current: Node = first;
  for (;;) {
    const next = current.nextSibling;
    parent.removeChild(current);
    if (current === last || next === null) break;
    current = next;
  }
}

/**
 * Applies a permutation list (entries [start, end) of `edits`) to a level —
 * Blazor's permuteLogicalChildren: resolve all moved ranges and their target
 * positions first (placeholder comments), then move each range as a unit.
 */
function permuteLogicalChildren(level: Level, edits: RenderTreeEdit[], start: number, end: number): void {
  const siblings: Node[] = [];
  for (let node = firstChildOf(level); node !== null && node !== level.boundary; node = lastNodeOf(node).nextSibling) {
    siblings.push(node);
  }
  const moves: Array<{ first: Node; last: Node; marker: Comment }> = [];
  for (let i = start; i < end; i++) {
    const first = siblings[edits[i]!.siblingIndex]!;
    moves.push({ first, last: lastNodeOf(first), marker: document.createComment("") });
  }
  for (let i = start; i < end; i++) {
    const before = siblings[edits[i]!.moveToSiblingIndex + 1] ?? level.boundary;
    level.parent.insertBefore(moves[i - start]!.marker, before);
  }
  for (const { first, last, marker } of moves) {
    let current: Node = first;
    for (;;) {
      const next = current.nextSibling;
      level.parent.insertBefore(current, marker);
      if (current === last || next === null) break;
      current = next;
    }
    level.parent.removeChild(marker);
  }
  level.index = 0;
  level.node = firstChildOf(level);
}

/* ------------------------------------------------------------------ */
/* Attribute application                                               */
/* ------------------------------------------------------------------ */

/** Sets a newly added or changed attribute (the diff filtered unchanged values). */
function setAttributeFrame(dom: DomRenderer, state: ComponentState, element: Element, frame: RenderTreeFrame): void {
  const name = frame.attributeName!;
  const value = frame.attributeValue;

  // Blazor conditional-attribute semantics: null/undefined = absent attribute
  // (`aria-label="@maybeUndefined"` never renders an empty attribute).
  if (value === null || value === undefined) {
    element.removeAttribute(name);
    return;
  }

  if (value instanceof EventCallback) {
    bindCallback(dom, state, element, name, value as unknown as EventCallback<never>, frame.eventHandlerFlags ?? 0);
    return;
  }
  if (typeof value === "function") {
    // Unbound handler: no owning component, so no automatic re-render.
    const callback = EventCallback.unbound(value as (arg: never) => void | Promise<void>);
    bindCallback(dom, state, element, name, callback, frame.eventHandlerFlags ?? 0);
    return;
  }
  if (typeof value === "boolean") {
    if (value) element.setAttribute(name, "");
    else element.removeAttribute(name);
    return;
  }
  if (name in element) {
    (element as unknown as Record<string, unknown>)[name] = value;
  } else {
    element.setAttribute(name, value === null || value === undefined ? "" : String(value));
  }
}

/** Removes an attribute that is gone from the new tree (or the listener bound under its name). */
function removeAttributeByName(element: Element, name: string): void {
  const eventName = toDomEventName(name);
  const record = elementHandlers.get(element)?.get(eventName);
  if (record) {
    element.removeEventListener(eventName, record.listener);
    elementHandlers.get(element)?.delete(eventName);
    return;
  }
  element.removeAttribute(name);
}

/** End (exclusive) of the contiguous attribute run after a start frame. */
function attributeRunEnd(frames: RenderTreeFrame[], startIndex: number): number {
  const end = startIndex + getFrameSubtreeLength(frames[startIndex]!);
  let i = startIndex + 1;
  while (i < end && frames[i]!.frameType === FrameType.Attribute) i++;
  return i;
}

function applyAttributes(dom: DomRenderer, state: ComponentState, element: Element, startFrame: RenderTreeFrame, frames: RenderTreeFrame[], startIndex: number): void {
  const end = startIndex + getFrameSubtreeLength(startFrame);
  for (let i = startIndex + 1; i < end; i++) {
    const frame = frames[i]!;
    if (frame.frameType === FrameType.Attribute) {
      setAttributeFrame(dom, state, element, frame);
    } else {
      break;
    }
  }
}

/** Maps a markup attribute name (@onclick) to the DOM event name (click). */
function toDomEventName(attributeName: string): string {
  return attributeName.toLowerCase().startsWith("on") ? attributeName.slice(2).toLowerCase() : attributeName;
}

function bindCallback(dom: DomRenderer, state: ComponentState, element: Element, attributeName: string, callback: EventCallback<never>, flags: number): void {
  const eventName = toDomEventName(attributeName);
  let map = elementHandlers.get(element);
  if (!map) {
    map = new Map<string, EventHandlerRecord>();
    elementHandlers.set(element, map);
  }
  const existing = map.get(eventName);
  if (existing) {
    element.removeEventListener(eventName, existing.listener);
  }
  const listener = (event: Event): void => {
    if (flags & 1) event.preventDefault(); // PreventDefault
    if (flags & 2) event.stopPropagation(); // StopPropagation
    dom.invokeEventHandler(state, callback, event);
  };
  element.addEventListener(eventName, listener);
  map.set(eventName, { callback, flags, listener });
}

/* ------------------------------------------------------------------ */
/* Markup helpers                                                      */
/* ------------------------------------------------------------------ */

/** Inserts a markup block as start comment + parsed nodes + end comment; returns the start. */
function insertMarkup(markup: string, parent: Node, before: Node | null): Comment {
  const start = document.createComment("bl-tsazor:markup");
  const end = document.createComment("/bl-tsazor:markup");
  const template = document.createElement("template");
  template.innerHTML = markup;
  parent.insertBefore(start, before);
  parent.insertBefore(template.content, before);
  parent.insertBefore(end, before);
  logicalRangeEnds.set(start, end);
  return start;
}

import { FrameType } from "../render-tree/frame-type";
import type { RenderTreeFrame } from "../render-tree/render-tree";
import { getFrameChildren, getFrameSubtreeLength } from "../render-tree/render-tree";
import { attributeMap, matchChildren } from "../render-tree/diff";
import { EventCallback } from "../components/event-callback";
import type { ComponentState } from "./component-state";
import type { Renderer } from "./renderer";

interface FrameContext {
  /** DOM node new frames render into. */
  parentDom: Node;
  /** Right boundary for insertions (e.g. the component's end marker), or null. */
  boundary: Node | null;
  /** Last rendered DOM node at this level; content goes after it. */
  lastNode: Node | null;
}

interface EventHandlerRecord {
  callback: EventCallback<never>;
  flags: number;
  listener: (event: Event) => void;
}

const elementHandlers = new WeakMap<Element, Map<string, EventHandlerRecord>>();

/** Renderer of the most recently constructed DomRenderer; used for event tracking. */
let activeRenderer: Renderer | null = null;

/**
 * Applies render tree frames to the real DOM (initial render and diff-based
 * updates). Blazor sends a RenderBatch over the WASM boundary; since Tasor's
 * renderer runs in the same realm, diffing and patching happen in one pass.
 */
export class DomRenderer {
  constructor(private readonly renderer: Renderer) {
    activeRenderer = renderer;
  }

  /** First render of a component: builds DOM between its markers. */
  renderInitial(state: ComponentState, frames: RenderTreeFrame[]): void {
    const nodes = new Map<number, Node>();
    const ctx: FrameContext = {
      parentDom: state.startMarker.parentNode!,
      boundary: state.endMarker,
      lastNode: state.startMarker,
    };
    this.processRange(state, frames, -1, frames.length, null, -1, ctx, nodes);
    state.renderedNodes = nodes;
  }

  /** Diff-and-patch: compares new frames against the previous tree and patches the DOM. */
  renderUpdate(state: ComponentState, oldFrames: RenderTreeFrame[], newFrames: RenderTreeFrame[]): void {
    const nodes = new Map<number, Node>();
    const ctx: FrameContext = {
      parentDom: state.startMarker.parentNode!,
      boundary: state.endMarker,
      lastNode: state.startMarker,
    };
    this.processRange(state, newFrames, -1, newFrames.length, oldFrames, -1, ctx, nodes);
    state.renderedNodes = nodes;
  }

  /** Removes the whole output of a disposed component (markers + content). */
  removeComponentOutput(state: ComponentState): void {
    removeBetween(state.startMarker, state.endMarker);
    state.startMarker.parentNode?.removeChild(state.startMarker);
    state.endMarker.parentNode?.removeChild(state.endMarker);
  }

  /** @internal Replaces the slot-children map after a render pass. */
  commitSlotChildren(state: ComponentState): void {
    state.slotChildren.clear();
    for (const [key, value] of state.newSlotChildren) {
      state.slotChildren.set(key, value);
    }
    state.newSlotChildren.clear();
  }

  private processRange(
    state: ComponentState,
    newFrames: RenderTreeFrame[],
    newParentIndex: number,
    newSubtreeLength: number,
    oldFrames: RenderTreeFrame[] | null,
    oldParentIndex: number,
    ctx: FrameContext,
    nodes: Map<number, Node>,
  ): void {
    const newChildren = directChildren(newFrames, newParentIndex, newSubtreeLength);
    const match = oldFrames !== null ? matchChildren(oldFrames, oldParentIndex, newFrames, newParentIndex) : null;

    for (const { index, frame } of newChildren) {
      const oldIndex = match?.matches.get(index) ?? null;
      this.processFrame(state, newFrames, index, frame, oldFrames, oldIndex, ctx, nodes);
    }

    // Remove old children that no longer exist (innermost first).
    if (match && match.removed.length > 0) {
      for (let i = match.removed.length - 1; i >= 0; i--) {
        this.removeOldFrame(state, oldFrames!, match.removed[i]!);
      }
    }
  }

  private processFrame(
    state: ComponentState,
    newFrames: RenderTreeFrame[],
    newIndex: number,
    frame: RenderTreeFrame,
    oldFrames: RenderTreeFrame[] | null,
    oldIndex: number | null,
    ctx: FrameContext,
    nodes: Map<number, Node>,
  ): void {
    let oldFrame: RenderTreeFrame | null = null;
    if (oldIndex !== null && oldFrames !== null) {
      const candidate = oldFrames[oldIndex]!;
      if (candidate.frameType === frame.frameType) {
        oldFrame = candidate;
      } else {
        // Same slot, different frame kind: rebuild from scratch.
        this.removeOldFrame(state, oldFrames, oldIndex);
        oldIndex = null;
      }
    }

    switch (frame.frameType) {
      case FrameType.Element:
        this.processElement(state, newFrames, newIndex, frame, oldFrames, oldIndex, oldFrame, ctx, nodes);
        break;
      case FrameType.Text:
        this.processText(newFrames, newIndex, frame, oldFrames, oldIndex, oldFrame, state, ctx, nodes);
        break;
      case FrameType.Markup:
        this.processMarkup(newFrames, newIndex, frame, oldFrames, oldIndex, oldFrame, state, ctx, nodes);
        break;
      case FrameType.Region:
        this.processRange(state, newFrames, newIndex, getFrameSubtreeLength(frame), oldFrames, oldIndex ?? -1, ctx, nodes);
        break;
      case FrameType.Component:
        this.processComponentFrame(state, newFrames, newIndex, frame, oldFrames, oldIndex, oldFrame, ctx, nodes);
        break;
      case FrameType.ElementReferenceCapture:
        if (ctx.parentDom instanceof Element) {
          frame.elementReferenceCaptureAction?.(ctx.parentDom);
        }
        break;
      default:
        break;
    }
  }

  private processElement(
    state: ComponentState,
    newFrames: RenderTreeFrame[],
    newIndex: number,
    frame: RenderTreeFrame,
    oldFrames: RenderTreeFrame[] | null,
    oldIndex: number | null,
    oldFrame: RenderTreeFrame | null,
    ctx: FrameContext,
    nodes: Map<number, Node>,
  ): void {
    const canUpdate =
      oldFrame !== null &&
      oldFrame.frameType === FrameType.Element &&
      oldFrame.elementName === frame.elementName &&
      typeof oldIndex === "number" &&
      oldIndex >= 0;

    if (canUpdate) {
      const node = state.renderedNodes.get(oldIndex!) as Element | undefined;
      if (node) {
        this.updateElementAttributes(node, oldFrames!, oldIndex!, newFrames, newIndex);
        positionNode(node, ctx);
        nodes.set(newIndex, node);
        ctx.lastNode = node;
        this.processRange(
          state,
          newFrames,
          newIndex,
          getFrameSubtreeLength(frame),
          oldFrames,
          oldIndex!,
          { parentDom: node, boundary: null, lastNode: null },
          nodes,
        );
        return;
      }
    }

    if (oldIndex !== null && oldIndex >= 0 && oldFrames !== null) {
      // Old frame existed but could not be reused; clean up stale output.
      this.removeOldFrame(state, oldFrames, oldIndex);
    }

    const element = document.createElement(frame.elementName!);
    applyAttributes(element, frame, newFrames, newIndex);
    insertNode(element, ctx);
    nodes.set(newIndex, element);
    ctx.lastNode = element;

    this.processRange(
      state,
      newFrames,
      newIndex,
      getFrameSubtreeLength(frame),
      null,
      -1,
      { parentDom: element, boundary: null, lastNode: null },
      nodes,
    );
  }

  private processText(
    _newFrames: RenderTreeFrame[],
    newIndex: number,
    frame: RenderTreeFrame,
    _oldFrames: RenderTreeFrame[] | null,
    oldIndex: number | null,
    oldFrame: RenderTreeFrame | null,
    state: ComponentState,
    ctx: FrameContext,
    nodes: Map<number, Node>,
  ): void {
    const node = oldFrame && oldIndex !== null ? (state.renderedNodes.get(oldIndex) as Text | undefined) : undefined;
    if (node && oldFrame) {
      if (oldFrame.textContent !== frame.textContent) {
        node.nodeValue = String(frame.textContent);
      }
      positionNode(node, ctx);
      nodes.set(newIndex, node);
      ctx.lastNode = node;
    } else {
      const textNode = document.createTextNode(String(frame.textContent));
      insertNode(textNode, ctx);
      nodes.set(newIndex, textNode);
      ctx.lastNode = textNode;
    }
  }

  private processMarkup(
    _newFrames: RenderTreeFrame[],
    newIndex: number,
    frame: RenderTreeFrame,
    _oldFrames: RenderTreeFrame[] | null,
    oldIndex: number | null,
    oldFrame: RenderTreeFrame | null,
    state: ComponentState,
    ctx: FrameContext,
    nodes: Map<number, Node>,
  ): void {
    const anchor = oldFrame && oldIndex !== null ? (state.renderedNodes.get(oldIndex) as Comment | undefined) : undefined;
    if (anchor && oldFrame && oldFrame.markupContent === frame.markupContent) {
      positionMarkup(anchor, ctx);
      nodes.set(newIndex, anchor);
      ctx.lastNode = findMarkupEnd(anchor);
    } else {
      if (anchor && oldIndex !== null && oldIndex >= 0 && oldFrame) {
        const end = findMarkupEnd(anchor);
        removeBetween(anchor, end);
        anchor.parentNode?.removeChild(end);
        anchor.parentNode?.removeChild(anchor);
      }
      const [start, end] = insertMarkup(frame.markupContent!, ctx);
      markupEnds.set(start, end);
      nodes.set(newIndex, start);
      ctx.lastNode = end;
    }
  }

  private processComponentFrame(
    state: ComponentState,
    newFrames: RenderTreeFrame[],
    newIndex: number,
    frame: RenderTreeFrame,
    oldFrames: RenderTreeFrame[] | null,
    oldIndex: number | null,
    oldFrame: RenderTreeFrame | null,
    ctx: FrameContext,
    nodes: Map<number, Node>,
  ): void {
    const childState = oldIndex !== null && oldIndex >= 0 ? state.slotChildren.get(oldIndex) : undefined;
    const canUpdate = childState !== undefined && oldFrame !== null && this.isSameComponentType(oldFrame.componentType, frame.componentType);

    if (canUpdate && childState) {
      if (oldFrame && oldFrame.componentType !== frame.componentType) {
        // Hot-swapped module: adopt the new definition in place, keep state.
        this.renderer.hmrSwap(oldFrame.componentType, frame.componentType);
      }
      positionComponent(childState, ctx);
      state.newSlotChildren.set(newIndex, childState);
      nodes.set(newIndex, childState.startMarker);
      ctx.lastNode = childState.endMarker;
      this.renderer.setComponentParameters(childState, attributeMap(newFrames, newIndex));
      return;
    }

    if (oldIndex !== null && oldIndex >= 0 && oldFrames !== null) {
      this.removeOldFrame(state, oldFrames, oldIndex);
    }

    const child = this.renderer.attachComponent(state, frame, attributeMap(newFrames, newIndex), ctx);
    state.newSlotChildren.set(newIndex, child);
    nodes.set(newIndex, child.startMarker);
    ctx.lastNode = child.endMarker;
  }

  /** Identity match, or a hot-swapped module reusing the same class name. */
  private isSameComponentType(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    const name = (a as { name?: string } | null)?.name;
    const otherName = (b as { name?: string } | null)?.name;
    return name !== undefined && name !== "" && name === otherName && this.renderer.wasHmrSwapped(name);
  }

  private updateElementAttributes(
    node: Element,
    oldFrames: RenderTreeFrame[],
    oldIndex: number,
    newFrames: RenderTreeFrame[],
    newIndex: number,
  ): void {
    const oldAttrs = attributeMap(oldFrames, oldIndex);
    const newAttrs = attributeMap(newFrames, newIndex);

    for (const [name, { frame }] of newAttrs) {
      const oldEntry = oldAttrs.get(name);
      if (!oldEntry) {
        setAttributeFrame(node, frame);
      } else if (!attributeValueSame(oldEntry.frame, frame)) {
        setAttributeFrame(node, frame, oldEntry.frame);
      }
    }
    for (const [name, { frame }] of oldAttrs) {
      if (!newAttrs.has(name)) {
        removeAttributeFrame(node, name, frame);
      }
    }
  }

  private removeOldFrame(state: ComponentState, oldFrames: RenderTreeFrame[], oldIndex: number): void {
    const frame = oldFrames[oldIndex]!;
    const node = state.renderedNodes.get(oldIndex);
    switch (frame.frameType) {
      case FrameType.Element:
      case FrameType.Text:
        node?.parentNode?.removeChild(node);
        break;
      case FrameType.Markup:
        if (node) {
          const end = findMarkupEnd(node as Comment);
          removeBetween(node, end);
          node.parentNode?.removeChild(end);
          node.parentNode?.removeChild(node);
        }
        break;
      case FrameType.Region:
        // Remove the region's children recursively (innermost first).
        for (const { index } of getFrameChildren(oldFrames, oldIndex).reverse()) {
          this.removeOldFrame(state, oldFrames, index);
        }
        break;
      case FrameType.Component: {
        const child = state.slotChildren.get(oldIndex);
        if (child) {
          this.renderer.disposeComponent(child);
          this.removeComponentOutput(child);
        }
        break;
      }
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Attribute application                                               */
/* ------------------------------------------------------------------ */

function attributeValueSame(oldFrame: RenderTreeFrame, newFrame: RenderTreeFrame): boolean {
  if (newFrame.attributeValue instanceof EventCallback || oldFrame.attributeValue instanceof EventCallback) {
    return (
      oldFrame.attributeValue instanceof EventCallback &&
      newFrame.attributeValue instanceof EventCallback &&
      (oldFrame.attributeValue as EventCallback<never>).equals(newFrame.attributeValue as EventCallback<never>)
    );
  }
  return oldFrame.attributeValue === newFrame.attributeValue;
}

/** Sets a newly added or changed attribute. `oldFrame` enables listener rebinding checks. */
function setAttributeFrame(element: Element, frame: RenderTreeFrame, oldFrame?: RenderTreeFrame): void {
  const name = frame.attributeName!;
  const value = frame.attributeValue;

  if (value instanceof EventCallback) {
    const existing = elementHandlers.get(element)?.get(name);
    if (existing && oldFrame && existing.callback.equals(value as unknown as EventCallback<never>)) {
      return;
    }
    bindCallback(element, name, value as unknown as EventCallback<never>, frame.eventHandlerFlags ?? 0);
    return;
  }
  if (typeof value === "function") {
    // Unbound handler: no owning component, so no automatic re-render.
    const existing = elementHandlers.get(element)?.get(name);
    if (existing && oldFrame?.attributeValue === value) return;
    const callback = EventCallback.unbound(value as (arg: never) => void | Promise<void>);
    bindCallback(element, name, callback, frame.eventHandlerFlags ?? 0);
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

function removeAttributeFrame(element: Element, name: string, frame: RenderTreeFrame): void {
  const value = frame.attributeValue;
  if (value instanceof EventCallback || typeof value === "function" || frame.eventHandlerName) {
    const record = elementHandlers.get(element)?.get(toDomEventName(name));
    if (record) {
      element.removeEventListener(toDomEventName(name), record.listener);
      elementHandlers.get(element)?.delete(toDomEventName(name));
    }
    return;
  }
  element.removeAttribute(name);
}

function applyAttributes(element: Element, startFrame: RenderTreeFrame, frames: RenderTreeFrame[], startIndex: number): void {
  const end = startIndex + getFrameSubtreeLength(startFrame);
  for (let i = startIndex + 1; i < end; i++) {
    const frame = frames[i]!;
    if (frame.frameType === FrameType.Attribute) {
      setAttributeFrame(element, frame);
    } else {
      break;
    }
  }
}

/** Maps a markup attribute name (@onclick) to the DOM event name (click). */
function toDomEventName(attributeName: string): string {
  return attributeName.toLowerCase().startsWith("on") ? attributeName.slice(2).toLowerCase() : attributeName;
}

function bindCallback(element: Element, attributeName: string, callback: EventCallback<never>, flags: number): void {
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
    const invocation = callback
      .invokeAsync(event as never)
      .catch((error) => reportError(error, `Event handler '${eventName}' failed`));
    if (activeRenderer) {
      activeRenderer.track(invocation);
    }
  };
  element.addEventListener(eventName, listener);
  map.set(eventName, { callback, flags, listener });
}

function reportError(error: unknown, context: string): void {
  // eslint-disable-next-line no-console
  console.error(`[tasor] ${context}:`, error);
}

/* ------------------------------------------------------------------ */
/* Markup helpers                                                      */
/* ------------------------------------------------------------------ */

const markupEnds = new WeakMap<Comment, Comment>();

function insertMarkup(markup: string, ctx: FrameContext): [Comment, Comment] {
  const start = document.createComment("bl-tasor:markup");
  const end = document.createComment("/bl-tasor:markup");
  insertNode(start, ctx);
  insertNode(end, ctx);
  const template = document.createElement("template");
  template.innerHTML = markup;
  const parent = start.parentNode!;
  while (template.content.firstChild) {
    parent.insertBefore(template.content.firstChild, end);
  }
  return [start, end];
}

function findMarkupEnd(start: Comment): Comment {
  return markupEnds.get(start) ?? (start.nextSibling as Comment) ?? start;
}

function positionMarkup(start: Comment, ctx: FrameContext): void {
  const end = findMarkupEnd(start);
  const reference = ctx.lastNode ? ctx.lastNode.nextSibling : ctx.parentDom.firstChild;
  if (start !== reference) {
    ctx.parentDom.insertBefore(start, reference);
    ctx.parentDom.insertBefore(end, start.nextSibling);
  }
}

function removeBetween(start: Node, end: Node): void {
  const parent = start.parentNode;
  if (!parent) return;
  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    parent.removeChild(current);
    current = next;
  }
}

function insertNode(node: Node, ctx: FrameContext): void {
  ctx.parentDom.insertBefore(node, ctx.boundary);
}

function positionNode(node: Node, ctx: FrameContext): void {
  const reference = ctx.lastNode ? ctx.lastNode.nextSibling : ctx.parentDom.firstChild;
  if (node !== reference) {
    ctx.parentDom.insertBefore(node, reference);
  }
}

function positionComponent(childState: { startMarker: Comment; endMarker: Comment }, ctx: FrameContext): void {
  const reference = ctx.lastNode ? ctx.lastNode.nextSibling : ctx.parentDom.firstChild;
  if (childState.startMarker !== reference) {
    ctx.parentDom.insertBefore(childState.startMarker, reference);
    ctx.parentDom.insertBefore(childState.endMarker, childState.startMarker.nextSibling);
  }
}

/** Direct child frames of a frame range (attribute frames are not children). */
function directChildren(
  frames: RenderTreeFrame[],
  parentIndex: number,
  subtreeLength: number,
): Array<{ index: number; frame: RenderTreeFrame }> {
  void subtreeLength;
  return getFrameChildren(frames, parentIndex);
}
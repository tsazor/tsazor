import { FrameType } from "../render-tree/frame-type.js";
import type { RenderTreeFrame } from "../render-tree/render-tree.js";
import { getFrameSubtreeLength } from "../render-tree/render-tree.js";
import { RenderTreeEditType, type RenderTreeEdit } from "../render-tree/diff.js";
import type { EventCallback } from "../components/event-callback.js";
import type { ComponentState } from "./component-state.js";
import { selectOf, setAttributeValue, syncSelectValue, type EventHandlerHost } from "./dom-attributes.js";
import { DomJournal } from "./dom-journal.js";
import { attachmentHost } from "./attachment-host.js";
import { motionHost, type MotionWork } from "./motion-host.js";
import { hasPortals, LogicalChildren, LogicalRange, markLeaving, nextLogicalSibling, portalElement, removeLogicalChild, sweepPortals } from "./logical-range.js";
import type { Renderer } from "./renderer.js";
import { componentInternals } from "../components/component-internals.js";

/**
 * Applies a diff's edit list to the real DOM (Blazor's BrowserRenderer). The
 * diff itself never touches the DOM; this walks the edits once, resolving
 * sibling indices against the live DOM with a forward cursor per level
 * (edits within a level are ordered by ascending sibling index). A level is
 * the logical children (see LogicalRange) of the component's own range or of
 * an element; child components and markup blocks are ranges and move or
 * disappear as a unit.
 *
 * Application is transactional: every mutation of DOM that existed before
 * the pass is journaled (DomJournal), and a pass that throws part-way is
 * rolled back before the error propagates — the DOM then again shows the
 * component's retained live tree, which stays the diff base of its next
 * pass. Limits: side effects outside the DOM tree are not undone (element
 * reference captures and custom-element callbacks that already ran, focus
 * or selection lost by moving a node, caret position after a value reset).
 */
export class DomRenderer implements EventHandlerHost {
  private readonly journal = new DomJournal();
  private applying = false;
  /**
   * F2: the batch's attachment work, flat `(state, element, name, value)`
   * entries (see AttachmentHost.run); null while there is none. Attachments
   * run at the batch end, so applying edits only queues them — a pass that
   * rolls back drops what it queued.
   */
  private attachmentWork: unknown[] | null = null;
  /** F4/F5: the batch's motion work (see MotionHost); null while there is none. Rolled back like attachmentWork. */
  private motionWork: MotionWork[] | null = null;

  /** Created by `Renderer`, which owns exactly one DomRenderer. */
  constructor(private readonly renderer: Renderer) {}

  /**
   * Runs a DOM event's handler for a listener bound while
   * rendering `state`: the invocation is tracked by this DomRenderer's own
   * renderer (waitUntilIdle), failures go to its error handler.
   */
  invokeEventHandler(state: ComponentState, callback: EventCallback<never>, event: Event): void {
    const invocation = callback
      .invokeAsync(event as never)
      .catch((error) => this.renderer.handleComponentError(error, state, "event"));
    this.renderer.trackFor(state, invocation, `${state.component.constructor.name || "a component"}: ${event.type} handler`);
  }

  /**
   * Applies the edits of one render pass of `state`; `frames` is its new
   * render tree. All or nothing: throws after rolling back what it applied.
   */
  applyEdits(state: ComponentState, frames: RenderTreeFrame[], edits: RenderTreeEdit[]): void {
    // Passes never nest (renders requested meanwhile only queue); a fresh
    // journal keeps a nested call safe anyway.
    const nested = this.applying;
    const journal = nested ? new DomJournal() : this.journal;
    const queued = this.attachmentWork?.length ?? 0;
    const queuedMotion = this.motionWork?.length ?? 0;
    this.applying = true;
    try {
      this.applyEditsJournaled(state, frames, edits, journal);
      journal.clear();
    } catch (error) {
      journal.rollback();
      if (this.attachmentWork !== null) this.attachmentWork.length = queued;
      if (this.motionWork !== null) this.motionWork.length = queuedMotion;
      throw error;
    } finally {
      this.applying = nested;
    }
  }

  private applyEditsJournaled(state: ComponentState, frames: RenderTreeFrame[], edits: RenderTreeEdit[], journal: DomJournal): void {
    const stack: LogicalChildren[] = [];
    let level = new LogicalChildren(state.range);
    /** Selects whose options this pass changed: their value is re-synced at the end. */
    let selects: HTMLSelectElement[] | null = null;
    /** F2: whether this pass already queued the check for removed attached elements. */
    let removed = false;
    /** F4: whether this is the component's first render (local intros don't play). */
    const firstPass = !componentInternals.firstRenderCompleted(state.component);

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]!;
      switch (edit.type) {
        case RenderTreeEditType.PrependFrame: {
          if (motionHost !== null) this.measureLevel(level);
          const before = level.at(edit.siblingIndex);
          level.seek(edit.siblingIndex, this.insertFrame(state, frames, edit.referenceFrameIndex, level.parent, before, journal, firstPass));
          selects = touchSelect(selects, level.parent);
          break;
        }
        case RenderTreeEditType.RemoveFrame: {
          const first = level.at(edit.siblingIndex)!;
          if (motionHost !== null) {
            this.measureLevel(level);
            if (!removed) this.queueMotion({ op: "sweep" });
          }
          if (motionHost?.leaves(state, first)) {
            // F4: an outro plays — the child stays in the DOM, skipped by indexing, until it ends.
            const next = nextLogicalSibling(first);
            markLeaving(first, journal);
            this.queueMotion({ op: "leave", state, first });
            level.seek(edit.siblingIndex, next);
          } else {
            level.seek(edit.siblingIndex, removeLogicalChild(first, journal));
          }
          selects = touchSelect(selects, level.parent);
          // F2: the removed subtree may hold attached elements — checked once per pass.
          if (attachmentHost !== null && !removed) this.queueAttachment(state, null, null, null);
          removed = true;
          break;
        }
        case RenderTreeEditType.SetAttribute: {
          const frame = frames[edit.referenceFrameIndex]!;
          const element = portalElement(level.at(edit.siblingIndex)) as Element;
          if (frame.frameType === FrameType.Attachment) this.queueDirective(state, element, frame.attributeName!, frame.attributeValue, false, firstPass);
          else setAttributeValue(this, state, element, frame.attributeName!, frame.attributeValue, frame.eventHandlerFlags ?? 0, journal);
          break;
        }
        case RenderTreeEditType.RemoveAttribute: {
          const name = edit.removedAttributeName!;
          const element = portalElement(level.at(edit.siblingIndex)) as Element;
          // F2: `@attach…` is an attachment frame's name (the `@` namespace is reserved).
          if (name.charCodeAt(0) === 64) {
            if (isAttachName(name)) this.queueAttachment(state, element, name, null);
            else this.queueMotion({ op: "remove", state, element, name });
          } else setAttributeValue(this, state, element, name, null, 0, journal);
          break;
        }
        case RenderTreeEditType.UpdateText: {
          const node = level.at(edit.siblingIndex)!;
          const text = String(frames[edit.referenceFrameIndex]!.textContent);
          journal.property(node, "nodeValue");
          node.nodeValue = text;
          break;
        }
        case RenderTreeEditType.UpdateMarkup: {
          const before = removeLogicalChild(level.at(edit.siblingIndex)!, journal);
          level.seek(edit.siblingIndex, insertMarkup(frames[edit.referenceFrameIndex]!.markupContent!, level.parent, before, journal));
          selects = touchSelect(selects, level.parent);
          break;
        }
        case RenderTreeEditType.StepIn: {
          const element = portalElement(level.at(edit.siblingIndex)) as Element;
          stack.push(level);
          level = new LogicalChildren(element);
          break;
        }
        case RenderTreeEditType.StepOut:
          level = stack.pop()!;
          break;
        case RenderTreeEditType.PermutationListEntry: {
          if (motionHost !== null) this.measureLevel(level);
          const moves: Array<{ from: number; to: number }> = [];
          for (; edits[i]!.type !== RenderTreeEditType.PermutationListEnd; i++) {
            moves.push({ from: edits[i]!.siblingIndex, to: edits[i]!.moveToSiblingIndex });
          }
          level.permute(moves, journal);
          selects = touchSelect(selects, level.parent);
          break;
        }
        default:
          break;
      }
    }
    if (selects !== null) {
      for (const select of selects) syncSelectValue(select, journal);
    }
    // An element `portal` moved goes with its placeholder, also when an ancestor was removed.
    if (removed && hasPortals()) sweepPortals();
  }

  /** F2: queues an attachment change of `element` (`element === null`: check for removed attached elements). */
  private queueAttachment(state: ComponentState, element: Element | null, name: string | null, value: unknown): void {
    (this.attachmentWork ??= []).push(state, element, name, value);
  }

  /**
   * An element directive frame (`@attach…`, or F4/F5 `@in`, `@out`,
   * `@transition`, `@animate`) was set: `inserted` with its element.
   */
  private queueDirective(state: ComponentState, element: Element, name: string, value: unknown, inserted: boolean, firstPass: boolean): void {
    if (isAttachName(name)) {
      if (inserted && typeof value !== "function") return;
      this.queueAttachment(state, element, name, value);
    } else {
      this.queueMotion({ op: "set", state, element, name, value, inserted, firstPass });
    }
  }

  private queueMotion(work: MotionWork): void {
    (this.motionWork ??= []).push(work);
  }

  /**
   * F5: before the first structural edit of a level in this pass, queues the
   * boxes of its animated children (FLIP's "first"); a no-op without any.
   */
  private measureLevel(level: LogicalChildren): void {
    if (level.measured || !motionHost!.animates) return;
    level.measured = true;
    const work = (this.motionWork ??= []);
    for (const node of level.list()) motionHost!.measure(node, work);
  }

  /** F4/F5: hands the batch's motion work over (null when there is none) and starts a new list. */
  takeMotionWork(): MotionWork[] | null {
    const work = this.motionWork;
    this.motionWork = null;
    return work;
  }

  /** F2: hands the batch's attachment work over (null when there is none) and starts a new list. */
  takeAttachmentWork(): unknown[] | null {
    const work = this.attachmentWork;
    this.attachmentWork = null;
    return work;
  }

  /** Replaces the slot-children map after a render pass. */
  commitSlotChildren(state: ComponentState): void {
    state.slotChildren.clear();
    for (const [key, value] of state.newSlotChildren) {
      state.slotChildren.set(key, value);
    }
    state.newSlotChildren.clear();
  }

  /**
   * Inserts frame `index` (with its whole subtree) before `before`; returns
   * its first DOM node. `journal` is null while building a detached subtree.
   */
  private insertFrame(state: ComponentState, frames: RenderTreeFrame[], index: number, parent: Node, before: Node | null, journal: DomJournal | null, firstPass: boolean): Node {
    const frame = frames[index]!;
    switch (frame.frameType) {
      case FrameType.Element: {
        const element = createElementIn(frame.elementName!, parent);
        const end = index + getFrameSubtreeLength(frame);
        let i = index + 1;
        // The element's own preamble: attributes, event handlers, attachments
        // and reference captures (Blazor's InputFile order) — children start
        // after it. The capture action fires here, on the fresh element; an
        // attachment is queued for the batch end (F2).
        for (; i < end; i++) {
          const attribute = frames[i]!;
          const type = attribute.frameType;
          if (type === FrameType.Attribute) {
            setAttributeValue(this, state, element, attribute.attributeName!, attribute.attributeValue, attribute.eventHandlerFlags ?? 0, null);
          } else if (type === FrameType.ElementReferenceCapture) {
            attribute.elementReferenceCaptureAction?.(element);
          } else if (type === FrameType.Attachment) {
            this.queueDirective(state, element, attribute.attributeName!, attribute.attributeValue, true, firstPass);
          } else {
            break;
          }
        }
        // Build the fresh subtree into the detached element first, then insert
        // the completed tree in one shot: mass creates then cost one insertion
        // per element instead of one per node (10k rows = ~3n insertBefore -> n).
        this.insertChildFrames(state, frames, i, end, element, firstPass);
        // Blazor's deferred select value: the options exist only now.
        if (element.tagName === "SELECT") syncSelectValue(element as HTMLSelectElement, null);
        journal?.position(element);
        parent.insertBefore(element, before);
        return element;
      }
      case FrameType.Text: {
        const text = document.createTextNode(String(frame.textContent));
        journal?.position(text);
        parent.insertBefore(text, before);
        return text;
      }
      case FrameType.Markup:
        return insertMarkup(frame.markupContent!, parent, before, journal);
      case FrameType.Component: {
        // Instantiated by the renderer from the diff's component list before the edits run.
        const child = state.newSlotChildren.get(index)!;
        child.range.insertBefore(parent, before, journal);
        return child.range.start;
      }
      default:
        throw new Error(`Unexpected frame type ${frame.frameType as number} in PrependFrame.`);
    }
  }

  /** Appends the child frames [start, end) of a new element (regions flattened). */
  private insertChildFrames(state: ComponentState, frames: RenderTreeFrame[], start: number, end: number, parent: Element, firstPass: boolean): void {
    let i = start;
    while (i < end) {
      const frame = frames[i]!;
      switch (frame.frameType) {
        case FrameType.Attribute:
        case FrameType.EventHandler:
        case FrameType.Attachment:
          break;
        case FrameType.Region:
          this.insertChildFrames(state, frames, i + 1, i + getFrameSubtreeLength(frame), parent, firstPass);
          break;
        case FrameType.ElementReferenceCapture:
          frame.elementReferenceCaptureAction?.(parent);
          break;
        default:
          this.insertFrame(state, frames, i, parent, null, null, firstPass);
          break;
      }
      i += getFrameSubtreeLength(frame);
    }
  }
}

/** Whether an element directive frame's name is an `@attach` (F2); the others are motion directives (F4/F5). */
function isAttachName(name: string): boolean {
  return name.startsWith("@attach");
}

/** Adds the select owning the options under `parent` (if any) to the pass's re-sync list. */
function touchSelect(selects: HTMLSelectElement[] | null, parent: Node): HTMLSelectElement[] | null {
  const select = selectOf(parent);
  if (select === null) return selects;
  if (selects === null) return [select];
  if (!selects.includes(select)) selects.push(select);
  return selects;
}

/* ------------------------------------------------------------------ */
/* Namespaces                                                          */
/* ------------------------------------------------------------------ */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Blazor's BrowserRenderer rule: SVG namespace for <svg> and for children of
 *  SVG elements, except inside <foreignObject> (which hosts HTML again). */
function isSvgContext(parent: Node): boolean {
  const element = parent as Element;
  return element.namespaceURI === SVG_NAMESPACE && element.localName !== "foreignObject";
}

function createElementIn(tagName: string, parent: Node): Element {
  return tagName === "svg" || isSvgContext(parent)
    ? document.createElementNS(SVG_NAMESPACE, tagName)
    : document.createElement(tagName);
}

/* ------------------------------------------------------------------ */
/* Markup blocks                                                       */
/* ------------------------------------------------------------------ */

/**
 * Inserts a markup block; returns its first node. F1a: the string is parsed
 * once (per context) and every insertion imports a copy of the parsed nodes.
 * A block of exactly one node — every compiler-emitted static block — is
 * inserted as that node, tracked like an element frame's node; any other
 * shape (MarkupString content) goes into a logical range between markers.
 */
function insertMarkup(markup: string, parent: Node, before: Node | null, journal: DomJournal | null): Node {
  const parsed = parsedMarkup(markup, parent);
  if (parsed.childNodes.length === 1) {
    const node = document.importNode(parsed.firstChild!, true);
    journal?.position(node);
    parent.insertBefore(node, before);
    return node;
  }
  const range = new LogicalRange("bl-tsazor:markup");
  const content = document.importNode(parsed, true);
  content.insertBefore(range.start, content.firstChild);
  content.appendChild(range.end);
  journal?.restore(range, removeRange, null);
  parent.insertBefore(content, before);
  return range.start;
}

/** The table structure a table part is parsed in, and how deep its content sits. */
const TABLE_WRAPPERS: Record<string, { open: string; close: string; depth: number }> = {
  td: { open: "<table><tbody><tr>", close: "</tr></tbody></table>", depth: 3 },
  th: { open: "<table><tbody><tr>", close: "</tr></tbody></table>", depth: 3 },
  tr: { open: "<table><tbody>", close: "</tbody></table>", depth: 2 },
  thead: { open: "<table>", close: "</table>", depth: 1 },
  tbody: { open: "<table>", close: "</table>", depth: 1 },
  tfoot: { open: "<table>", close: "</table>", depth: 1 },
  caption: { open: "<table>", close: "</table>", depth: 1 },
  colgroup: { open: "<table>", close: "</table>", depth: 1 },
  col: { open: "<table><colgroup>", close: "</colgroup></table>", depth: 2 },
};

/** Parsed markup per string, for HTML and SVG contexts; bounded, since MarkupString content can be anything. */
const MARKUP_CACHE_SIZE = 1000;
const markupCache = { html: new Map<string, DocumentFragment>(), svg: new Map<string, DocumentFragment>() };

function parsedMarkup(markup: string, parent: Node): DocumentFragment {
  const cache = isSvgContext(parent) ? markupCache.svg : markupCache.html;
  let parsed = cache.get(markup);
  if (parsed === undefined) {
    parsed = parseMarkup(markup, parent);
    if (cache.size >= MARKUP_CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(markup, parsed);
  }
  return parsed;
}

/**
 * Trusted Types (E1): under `require-trusted-types-for 'script'`, `innerHTML`
 * only takes TrustedHTML. MarkupString is the app's own statement that a
 * string is safe HTML (as in Blazor), so the runtime's policy — named
 * `tsazor`, to be allowed by the CSP's `trusted-types` directive — passes it
 * through unchanged; it does not sanitize. Created on first use; without
 * Trusted Types, or when the CSP doesn't allow the name, plain strings.
 */
let markupPolicy: { createHTML(markup: string): unknown } | null | undefined;
function trustedHtml(markup: string): string {
  if (markupPolicy === undefined) {
    const factory = (globalThis as { trustedTypes?: { createPolicy(name: string, rules: { createHTML(input: string): string }): { createHTML(markup: string): unknown } } }).trustedTypes;
    try {
      markupPolicy = factory?.createPolicy("tsazor", { createHTML: (input) => input }) ?? null;
    } catch {
      markupPolicy = null; // the CSP doesn't allow 'tsazor': innerHTML reports the violation itself
    }
  }
  return (markupPolicy ? markupPolicy.createHTML(markup) : markup) as string;
}

/** Parses markup into a fragment; inside SVG it is parsed in an <svg> element
 *  so <circle>, <path>… get the SVG namespace (Blazor's sharedSvgElemForParsing). */
function parseMarkup(markup: string, parent: Node): DocumentFragment {
  if (!isSvgContext(parent)) {
    const template = document.createElement("template");
    // Table parts (a static <td> block inside a dynamic <tr>) are parsed inside
    // their table structure: parsers without the template's table modes
    // (happy-dom, older engines) would otherwise drop the tags.
    const wrapper = TABLE_WRAPPERS[/^<([a-z]+)/.exec(markup)?.[1] ?? ""];
    if (wrapper === undefined) {
      template.innerHTML = trustedHtml(markup);
      return template.content;
    }
    template.innerHTML = trustedHtml(`${wrapper.open}${markup}${wrapper.close}`);
    let host: ParentNode = template.content;
    for (let level = 0; level < wrapper.depth; level++) host = host.firstElementChild!;
    const fragment = document.createDocumentFragment();
    while (host.firstChild) fragment.appendChild(host.firstChild);
    return fragment;
  }
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.innerHTML = trustedHtml(markup);
  const fragment = document.createDocumentFragment();
  while (svg.firstChild) fragment.appendChild(svg.firstChild);
  return fragment;
}

function removeRange(range: LogicalRange): void {
  range.remove();
}

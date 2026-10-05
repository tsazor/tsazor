import { FrameType } from "../render-tree/frame-type.js";
import type { RenderTreeFrame } from "../render-tree/render-tree.js";
import { getFrameSubtreeLength } from "../render-tree/render-tree.js";
import { RenderTreeEditType, type RenderTreeEdit } from "../render-tree/diff.js";
import type { EventCallback } from "../components/event-callback.js";
import type { ComponentState } from "./component-state.js";
import { selectOf, setAttributeValue, syncSelectValue, type EventHandlerHost } from "./dom-attributes.js";
import { DomJournal } from "./dom-journal.js";
import { LogicalChildren, LogicalRange, removeLogicalChild } from "./logical-range.js";
import type { Renderer } from "./renderer.js";

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

  /** @internal Created by `Renderer`, which owns exactly one DomRenderer. */
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

  /**
   * Applies the edits of one render pass of `state`; `frames` is its new
   * render tree. All or nothing: throws after rolling back what it applied.
   */
  applyEdits(state: ComponentState, frames: RenderTreeFrame[], edits: RenderTreeEdit[]): void {
    // Passes never nest (renders requested meanwhile only queue); a fresh
    // journal keeps a nested call safe anyway.
    const nested = this.applying;
    const journal = nested ? new DomJournal() : this.journal;
    this.applying = true;
    try {
      this.applyEditsJournaled(state, frames, edits, journal);
      journal.clear();
    } catch (error) {
      journal.rollback();
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

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]!;
      switch (edit.type) {
        case RenderTreeEditType.PrependFrame: {
          const before = level.at(edit.siblingIndex);
          level.seek(edit.siblingIndex, this.insertFrame(state, frames, edit.referenceFrameIndex, level.parent, before, journal));
          selects = touchSelect(selects, level.parent);
          break;
        }
        case RenderTreeEditType.RemoveFrame:
          level.seek(edit.siblingIndex, removeLogicalChild(level.at(edit.siblingIndex)!, journal));
          selects = touchSelect(selects, level.parent);
          break;
        case RenderTreeEditType.SetAttribute: {
          const frame = frames[edit.referenceFrameIndex]!;
          const element = level.at(edit.siblingIndex) as Element;
          setAttributeValue(this, state, element, frame.attributeName!, frame.attributeValue, frame.eventHandlerFlags ?? 0, journal);
          break;
        }
        case RenderTreeEditType.RemoveAttribute:
          setAttributeValue(this, state, level.at(edit.siblingIndex) as Element, edit.removedAttributeName!, null, 0, journal);
          break;
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
          const element = level.at(edit.siblingIndex) as Element;
          stack.push(level);
          level = new LogicalChildren(element);
          break;
        }
        case RenderTreeEditType.StepOut:
          level = stack.pop()!;
          break;
        case RenderTreeEditType.PermutationListEntry: {
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
  }

  /** @internal Replaces the slot-children map after a render pass. */
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
  private insertFrame(state: ComponentState, frames: RenderTreeFrame[], index: number, parent: Node, before: Node | null, journal: DomJournal | null): Node {
    const frame = frames[index]!;
    switch (frame.frameType) {
      case FrameType.Element: {
        const element = createElementIn(frame.elementName!, parent);
        const end = index + getFrameSubtreeLength(frame);
        let i = index + 1;
        // The element's own preamble: attributes, event handlers and reference
        // captures (Blazor's InputFile order) — children start after it. The
        // capture action fires here, on the fresh element.
        for (; i < end && (frames[i]!.frameType === FrameType.Attribute || frames[i]!.frameType === FrameType.ElementReferenceCapture); i++) {
          const attribute = frames[i]!;
          if (attribute.frameType === FrameType.ElementReferenceCapture) {
            attribute.elementReferenceCaptureAction?.(element);
            continue;
          }
          setAttributeValue(this, state, element, attribute.attributeName!, attribute.attributeValue, attribute.eventHandlerFlags ?? 0, null);
        }
        // Build the fresh subtree into the detached element first, then insert
        // the completed tree in one shot: mass creates then cost one insertion
        // per element instead of one per node (10k rows = ~3n insertBefore -> n).
        this.insertChildFrames(state, frames, i, end, element);
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
          this.insertFrame(state, frames, i, parent, null, null);
          break;
      }
      i += getFrameSubtreeLength(frame);
    }
  }
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

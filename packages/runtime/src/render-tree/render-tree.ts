import { FrameType, EventHandlerFlags } from "./frame-type.js";
import type { ComponentType } from "../components/component-definition.js";
import { EventCallback } from "../components/event-callback.js";
import type { ComponentBase } from "../components/component-base.js";
import { MarkupString } from "../components/markup-string.js";

/** A fragment of render output: writes frames into a builder. Blazor's RenderFragment. */
export type RenderFragment = (builder: RenderTreeBuilder) => void;

/**
 * One entry of the flat render tree. Frames are kept as small object literals
 * (one per frame kind, carrying only that kind's fields — measured: a 17-field
 * monomorphic frame class retains 30% MORE memory than literals, because text
 * and attribute frames are ~2/3 of all frames) and the builder mutates
 * subtreeLength/key in place on close instead of copying with `{ ...frame }`
 * spreads (which allocated element frames twice per render). Blazor's struct
 * pool is the same idea with in-place slot writes.
 */
export interface RenderTreeFrame {
  /** The kind of frame; decides which of the optional fields are set. */
  readonly frameType: FrameType;
  /** Sequence number of the source position that wrote the frame; the diff matches sibling frames by it. */
  readonly sequence: number;
  /** Element frames */
  readonly elementName?: string;
  /** The element's `@key`, set by `setKey`; keyed elements are matched by key instead of sequence. */
  readonly elementKey?: string | number | object | null;
  /** Number of frames the element spans — itself, its attributes and its descendants; set on close. */
  readonly elementSubtreeLength?: number;
  /** Text frames */
  readonly textContent?: string | number | boolean | bigint;
  /** Attribute frames; on attachment frames the directive (`@attach`, `@attach:name`). */
  readonly attributeName?: string;
  /** The attribute's value: a primitive, an `EventCallback`, a function, a fragment or any object; on attachment frames the attachment (or null/undefined/false). */
  readonly attributeValue?: unknown;
  /** Event name of an attribute written by `addEventHandler` (equal to `attributeName`). */
  readonly eventHandlerName?: string;
  /** Event directive flags (`preventDefault`, `stopPropagation`) of an attribute written by `addEventHandler`. */
  readonly eventHandlerFlags?: EventHandlerFlags;
  /** Component frames */
  readonly componentType?: ComponentType;
  /** Reserved for the child component's id (Blazor's ComponentId); currently never written. */
  readonly componentId?: number;
  /** Component @key: string | number from markup (`@key="…"`), any object from
   *  programmatic builds — SectionOutlet keys its nested renderer by the
   *  fragment (Blazor's SetKey(RenderFragment), object identity). */
  readonly componentKey?: string | number | object | null;
  /** Number of frames the component frame spans — itself and its parameter attributes; set on close. */
  readonly componentSubtreeLength?: number;
  /** Region frames */
  readonly regionSubtreeLength?: number;
  /** Element reference captures */
  readonly elementReferenceCaptureAction?: (element: Element) => void;
  /** Component reference captures (2.4): the freshly instantiated child's instance. */
  readonly componentReferenceCaptureAction?: (component: ComponentBase) => void;
  /** Markup frames */
  readonly markupContent?: string;
}

/** The builder is allowed to close over and finish frames in place. */
type EditableFrame = { -readonly [K in keyof RenderTreeFrame]: RenderTreeFrame[K] };

/** Value that may be passed to addAttribute. Mirrors Blazor's `object`: any
 *  non-primitive is allowed — including class instances (models, domain
 *  objects) that TS structurally rejects for `Record<string, unknown>` due to
 *  the missing index signature. Consumption reads frames as `unknown`, so the
 *  narrowing happens at the actual usage, not here. */
export type AttributeValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | EventCallback<any>
  | RenderFragment
  | Record<string, unknown>
  | object
  | symbol;

/**
 * Builds a flat render tree, mirroring Blazor's RenderTreeBuilder.
 * Frames are appended sequentially; subtree lengths are resolved on close.
 */
export class RenderTreeBuilder {
  private readonly frames: RenderTreeFrame[] = [];
  private readonly openFrameStack: number[] = [];
  /** H2: this pass's reusable keyed rows, flat in build order — site, key, values, start frame index. */
  private readonly reuseRecords: unknown[] = [];
  /** H2: where the next row is expected in the source's records (rows usually keep their order). */
  private reuseCursor = 0;
  /** H2: the builder holding the previous render's frames (the component's other builder). */
  private reuseSource: RenderTreeBuilder | null = null;
  /** H2: key → offset into reuseRecords, built when a row is not where the cursor expects it. */
  private reuseIndex: Map<unknown, number> | null = null;

  /** Total number of frames written so far. */
  get count(): number {
    return this.frames.length;
  }

  /** The frames written so far — the builder's live array, not a copy. */
  getFrames(): RenderTreeFrame[] {
    return this.frames;
  }

  /** Blazor's RenderTreeBuilder.OpenElement: starts an element frame; its attributes and children follow until `closeElement`. */
  openElement(sequence: number, elementName: string): void {
    this.frames.push({ frameType: FrameType.Element, sequence, elementName });
    this.openFrameStack.push(this.frames.length - 1);
  }

  /** Blazor's CloseElement: closes the innermost open element and records its subtree length. */
  closeElement(): void {
    this.closeOpenFrame();
  }

  /** Blazor's OpenComponent: starts a child component frame; the attributes that follow become its parameters. */
  openComponent(sequence: number, componentType: ComponentType): void {
    this.frames.push({ frameType: FrameType.Component, sequence, componentType });
    this.openFrameStack.push(this.frames.length - 1);
  }

  /** Blazor's CloseComponent: closes the innermost open component frame. */
  closeComponent(): void {
    this.closeOpenFrame();
  }

  /** Blazor's OpenRegion: starts a region grouping a fragment's frames; the diff compares a region's contents only with the matching region's. */
  openRegion(sequence: number): void {
    this.frames.push({ frameType: FrameType.Region, sequence });
    this.openFrameStack.push(this.frames.length - 1);
  }

  /** Blazor's CloseRegion: closes the innermost open region. */
  closeRegion(): void {
    this.closeOpenFrame();
  }

  /**
   * Blazor's SetKey (`@key`): sets the key of the innermost open element or
   * component. Throws when nothing is open or the open frame is a region.
   */
  setKey(key: string | number | null | undefined | object): void {
    const index = this.openFrameStack[this.openFrameStack.length - 1];
    if (index === undefined) {
      throw new Error("setKey may only be called inside an open element or component.");
    }
    const frame = this.frames[index]! as EditableFrame;
    if (frame.frameType === FrameType.Element) {
      frame.elementKey = key;
    } else if (frame.frameType === FrameType.Component) {
      frame.componentKey = key;
    } else {
      throw new Error("setKey may only be used on elements or components.");
    }
  }

  /** Blazor's AddAttribute: adds an attribute to the open element, or a parameter to the open component. */
  addAttribute(sequence: number, name: string, value: AttributeValue): void {
    this.frames.push({ frameType: FrameType.Attribute, sequence, attributeName: name, attributeValue: value });
  }

  /** Adds an event-handler attribute carrying its directive flags (used by generated code).
   *  `any` (not `never`!): the generated code types inline handlers by inference
   *  (`(e) => …` in `@bind`), and a contextual `EventCallback<never>` would make
   *  TS infer the lambda parameter as `never` — `e.target` then fails with 2339. */
  addEventHandler(sequence: number, name: string, callback: EventCallback<any>, flags: EventHandlerFlags | number = EventHandlerFlags.None): void {
    this.frames.push({
      frameType: FrameType.Attribute,
      sequence,
      attributeName: name,
      attributeValue: callback,
      eventHandlerName: name,
      eventHandlerFlags: flags as EventHandlerFlags,
    });
  }

  /**
   * Blazor's AddMultipleAttributes (`@attributes`): null/undefined adds
   * nothing — a captureUnmatchedValues property stays unset while the parent
   * passes no extra attributes.
   */
  addMultipleAttributes(sequence: number, attributes: Readonly<Record<string, unknown>> | null | undefined): void {
    if (attributes === null || attributes === undefined) return;
    for (const name of Object.keys(attributes)) {
      this.addAttribute(sequence, name, attributes[name] as AttributeValue);
    }
  }

  /**
   * Blazor's AddContent: a fragment renders inside a region, a `MarkupString`
   * as unescaped markup, `null`/`undefined` as nothing and any other value as
   * text (booleans as `"true"`/`"false"`). Inside an open component frame the
   * content becomes the component's `ChildContent` parameter; a second one throws.
   */
  addContent(
    sequence: number,
    textOrFragment:
      | string
      | number
      | boolean
      | bigint
      | null
      | undefined
      | RenderFragment
      | MarkupString,
  ): void {
    // Blazor's builder: content written inside a component frame becomes the
    // component's ChildContent parameter instead of a renderable subtree.
    const parentIndex = this.openFrameStack[this.openFrameStack.length - 1];
    if (parentIndex !== undefined && this.frames[parentIndex]!.frameType === FrameType.Component) {
      const componentIndex = parentIndex;
      // Duplicate check: only the component's own attribute run (Blazor
      // throws on a second ChildContent written for the same component).
      for (let i = componentIndex + 1; i < this.frames.length; i++) {
        const f = this.frames[i]!;
        if (f.frameType !== FrameType.Attribute) break;
        if (f.attributeName === "ChildContent") {
          throw new Error("Duplicate ChildContent: only one child content block may be written per component frame.");
        }
      }
      const fragment =
        typeof textOrFragment === "function"
          ? textOrFragment
          : (b: RenderTreeBuilder) => b.addContent(sequence, textOrFragment);
      this.frames.push({ frameType: FrameType.Attribute, sequence, attributeName: "ChildContent", attributeValue: fragment });
      return;
    }
    if (typeof textOrFragment === "function") {
      this.openRegion(sequence);
      textOrFragment(this);
      this.closeRegion();
    } else if (textOrFragment === null || textOrFragment === undefined) {
      // Blazor's AddContent(object?) renders value?.ToString(): null is nothing.
    } else if (textOrFragment instanceof MarkupString) {
      // Blazor: a MarkupString content value yields an unescaped Markup frame.
      this.frames.push({ frameType: FrameType.Markup, sequence, markupContent: textOrFragment.value });
    } else {
      // Every other value renders as its string — booleans included ("true"/
      // "false", the TS analogue of Blazor's "True"/"False"); there is no
      // React-style "false renders nothing".
      this.frames.push({ frameType: FrameType.Text, sequence, textContent: textOrFragment });
    }
  }

  /** Blazor's AddMarkupContent: adds an HTML string that is inserted unescaped; `null` adds nothing. */
  addMarkupContent(sequence: number, markup: string | null): void {
    if (markup === null || markup === undefined) return;
    this.frames.push({ frameType: FrameType.Markup, sequence, markupContent: markup });
  }

  /** Blazor's AddElementReferenceCapture (`@ref` on an element): `action` receives the enclosing element's DOM node when it is created. */
  addElementReferenceCapture(sequence: number, action: (element: Element) => void): void {
    this.frames.push({ frameType: FrameType.ElementReferenceCapture, sequence, elementReferenceCaptureAction: action });
  }

  /** Captures the child component instance built into the enclosing component
   *  frame (`@ref` on a component tag, 2.4) — Blazor's ComponentReferenceCapture. */
  addComponentReferenceCapture(sequence: number, action: (component: ComponentBase) => void): void {
    this.frames.push({ frameType: FrameType.ComponentReferenceCapture, sequence, componentReferenceCaptureAction: action });
  }

  /**
   * @internal H2 render hints (docs/design-render-hints.md), called by
   * generated code before a keyed `@foreach` row: when the previous render
   * built a row at the same `site` with the same `key` from the same
   * `values` (every dynamic value of the row, in evaluation order), its
   * frames are copied — the same frame objects, which are never changed
   * after their element closed — and true is returned: the caller skips
   * building the row, and the diff skips it as unchanged. Otherwise the row
   * is recorded and false is returned: the caller builds it as usual.
   *
   * `site` identifies the row's source position (one array per compiled
   * site and module evaluation) and holds a check per value: 0 compares
   * only (`Object.is`, `EventCallback.equals`), 1 also requires a primitive
   * (a child component parameter — Blazor re-renders a child whose
   * parameter is an object), 2 rejects a function (content that is a
   * fragment builds frames of its own).
   */
  reuseKeyed(site: readonly number[], key: unknown, values: readonly unknown[]): boolean {
    const frames = this.frames;
    const source = this.reuseSource;
    if (source !== null && key !== null && key !== undefined) {
      const records = source.reuseRecords;
      let at = this.reuseCursor;
      if (at >= records.length || records[at] !== site || records[at + 1] !== key) {
        at = source.reuseRecordOf(key);
        if (at >= 0 && records[at] !== site) at = -1;
      }
      if (at >= 0) {
        this.reuseCursor = at + 4;
        const previous = records[at + 2] as readonly unknown[];
        const start = records[at + 3] as number;
        const sourceFrames = source.frames;
        const first = sourceFrames[start];
        if (sameValues(site, previous, values) && first !== undefined && first.frameType === FrameType.Element && first.elementKey === key) {
          const end = start + (first.elementSubtreeLength ?? 1);
          this.reuseRecords.push(site, key, previous, frames.length);
          for (let i = start; i < end; i++) frames.push(sourceFrames[i]!);
          return true;
        }
      }
    }
    this.reuseRecords.push(site, key, values, frames.length);
    return false;
  }

  /** @internal H2: the builder whose frames are the previous render (ComponentState pairs its two builders). */
  setReuseSource(source: RenderTreeBuilder | null): void {
    this.reuseSource = source;
  }

  /** H2: offset of the last record with `key` in this builder's records, or -1. */
  private reuseRecordOf(key: unknown): number {
    let index = this.reuseIndex;
    if (index === null) {
      index = new Map();
      const records = this.reuseRecords;
      for (let i = 0; i < records.length; i += 4) index.set(records[i + 1], i);
      this.reuseIndex = index;
    }
    return index.get(key) ?? -1;
  }

  /** Clears the builder for reuse. */
  clear(): void {
    this.frames.length = 0;
    this.openFrameStack.length = 0;
    this.reuseRecords.length = 0;
    this.reuseCursor = 0;
    this.reuseIndex = null;
  }

  private closeOpenFrame(): void {
    const index = this.openFrameStack.pop();
    if (index === undefined) {
      throw new Error("No open frame to close.");
    }
    const frame = this.frames[index]! as EditableFrame;
    const subtreeLength = this.frames.length - index;
    // in place — no spread copy (Blazor's struct-pool behaviour)
    if (frame.frameType === FrameType.Element) {
      frame.elementSubtreeLength = subtreeLength;
    } else if (frame.frameType === FrameType.Component) {
      frame.componentSubtreeLength = subtreeLength;
    } else if (frame.frameType === FrameType.Region) {
      frame.regionSubtreeLength = subtreeLength;
    }
  }
}

/** H2: whether a row's values equal the previous render's, under the site's checks (see reuseKeyed). */
function sameValues(site: readonly number[], previous: readonly unknown[], values: readonly unknown[]): boolean {
  const length = values.length;
  if (previous.length !== length) return false;
  for (let i = 0; i < length; i++) {
    const value = values[i];
    const check = site[i];
    if (check === 1) {
      if (value !== null && (typeof value === "object" || typeof value === "function")) return false;
    } else if (check === 2) {
      if (typeof value === "function") return false;
    }
    const old = previous[i];
    if (Object.is(old, value)) continue;
    if (old instanceof EventCallback && value instanceof EventCallback && old.equals(value as EventCallback<never>)) continue;
    return false;
  }
  return true;
}

/** Attribute frames immediately follow an element/component start frame. */
export function isAttributeFrame(frame: RenderTreeFrame): boolean {
  return frame.frameType === FrameType.Attribute || frame.frameType === FrameType.EventHandler;
}

/** Iterates the direct child frames of a frame (attribute frames are skipped). */
export function getFrameChildren(frames: RenderTreeFrame[], parentIndex: number): Array<{ index: number; frame: RenderTreeFrame }> {
  const result: Array<{ index: number; frame: RenderTreeFrame }> = [];

  // A parent index of -1 denotes the implicit root: only top-level frames are
  // children — nested frames are reached through their parent's subtree.
  if (parentIndex < 0) {
    let i = 0;
    while (i < frames.length) {
      const frame = frames[i]!;
      if (frame.frameType === FrameType.Attribute) {
        i++;
        continue;
      }
      result.push({ index: i, frame });
      i += getFrameSubtreeLength(frame);
    }
    return result;
  }

  const parent = frames[parentIndex]!;
  const subtreeLength = getFrameSubtreeLength(parent);
  const end = parentIndex + subtreeLength;
  let i = parentIndex + 1;
  while (i < end) {
    const frame = frames[i]!;
    if (frame.frameType === FrameType.Attribute) {
      i++;
      continue;
    }
    result.push({ index: i, frame });
    i += getFrameSubtreeLength(frame);
  }
  return result;
}

export function getFrameSubtreeLength(frame: RenderTreeFrame): number {
  switch (frame.frameType) {
    case FrameType.Element: return frame.elementSubtreeLength ?? 1;
    case FrameType.Component: return frame.componentSubtreeLength ?? 1;
    case FrameType.Region: return frame.regionSubtreeLength ?? 1;
    default: return 1;
  }
}

/** Extracts attributes (name → frame index) that follow an element/component start frame. */
export function getFrameAttributes(frames: RenderTreeFrame[], startIndex: number): Array<{ index: number; frame: RenderTreeFrame }> {
  const result: Array<{ index: number; frame: RenderTreeFrame }> = [];
  const end = startIndex + getFrameSubtreeLength(frames[startIndex]!);
  for (let i = startIndex + 1; i < end; i++) {
    const frame = frames[i]!;
    if (isAttributeFrame(frame)) {
      result.push({ index: i, frame });
    } else {
      break;
    }
  }
  return result;
}

/** Walks the whole frame array top-down, including attribute frames. */
export function* iterateFrames(frames: RenderTreeFrame[]): Generator<{ index: number; frame: RenderTreeFrame }> {
  for (let i = 0; i < frames.length; i++) {
    yield { index: i, frame: frames[i]! };
  }
}

export { FrameType, EventHandlerFlags };
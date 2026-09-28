import { FrameType, EventHandlerFlags } from "./frame-type";
import type { ComponentDefinition } from "../components/component-definition";
import type { EventCallback } from "../components/event-callback";

/** A fragment of render output: writes frames into a builder. Blazor's RenderFragment. */
export type RenderFragment = (builder: RenderTreeBuilder) => void;

/**
 * One entry of the flat render tree. Blazor uses a struct pool; we use plain
 * objects (V8-friendly, internal API that can be optimized later without an
 * API break).
 */
export interface RenderTreeFrame {
  readonly frameType: FrameType;
  readonly sequence: number;
  /** Element frames */
  readonly elementName?: string;
  readonly elementKey?: string | number | null;
  readonly elementSubtreeLength?: number;
  /** Text frames */
  readonly textContent?: string | number;
  /** Attribute frames */
  readonly attributeName?: string;
  readonly attributeValue?: unknown;
  readonly eventHandlerName?: string;
  readonly eventHandlerFlags?: EventHandlerFlags;
  /** Component frames */
  readonly componentType?: ComponentDefinition;
  readonly componentId?: number;
  readonly componentKey?: string | number | null;
  readonly componentSubtreeLength?: number;
  /** Region frames */
  readonly regionSubtreeLength?: number;
  /** Element reference captures */
  readonly elementReferenceCaptureAction?: (element: Element) => void;
  /** Markup frames */
  readonly markupContent?: string;
}

/** Value that may be passed to addAttribute. */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | EventCallback<never>
  | RenderFragment
  | Record<string, unknown>;

/**
 * Builds a flat render tree, mirroring Blazor's RenderTreeBuilder.
 * Frames are appended sequentially; subtree lengths are resolved on close.
 */
export class RenderTreeBuilder {
  private readonly frames: RenderTreeFrame[] = [];
  private readonly openFrameStack: number[] = [];

  /** Total number of frames written so far. */
  get count(): number {
    return this.frames.length;
  }

  getFrames(): RenderTreeFrame[] {
    return this.frames;
  }

  openElement(sequence: number, elementName: string): void {
    this.append({ frameType: FrameType.Element, sequence, elementName });
    this.openFrameStack.push(this.frames.length - 1);
  }

  closeElement(): void {
    this.closeOpenFrame();
  }

  openComponent(sequence: number, componentType: ComponentDefinition): void {
    this.append({ frameType: FrameType.Component, sequence, componentType });
    this.openFrameStack.push(this.frames.length - 1);
  }

  closeComponent(): void {
    this.closeOpenFrame();
  }

  openRegion(sequence: number): void {
    this.append({ frameType: FrameType.Region, sequence });
    this.openFrameStack.push(this.frames.length - 1);
  }

  closeRegion(): void {
    this.closeOpenFrame();
  }

  setKey(key: string | number | null | undefined): void {
    const index = this.openFrameStack[this.openFrameStack.length - 1];
    if (index === undefined) {
      throw new Error("setKey may only be called inside an open element or component.");
    }
    const frame = this.frames[index]!;
    if (frame.frameType === FrameType.Element) {
      this.frames[index] = { ...frame, elementKey: key };
    } else if (frame.frameType === FrameType.Component) {
      this.frames[index] = { ...frame, componentKey: key };
    } else {
      throw new Error("setKey may only be used on elements or components.");
    }
  }

  addAttribute(sequence: number, name: string, value: AttributeValue): void {
    this.append({ frameType: FrameType.Attribute, sequence, attributeName: name, attributeValue: value });
  }

  /** Adds an event-handler attribute carrying its directive flags (used by generated code). */
  addEventHandler(sequence: number, name: string, callback: EventCallback<never>, flags: EventHandlerFlags | number = EventHandlerFlags.None): void {
    this.append({
      frameType: FrameType.Attribute,
      sequence,
      attributeName: name,
      attributeValue: callback,
      eventHandlerName: name,
      eventHandlerFlags: flags as EventHandlerFlags,
    });
  }

  addMultipleAttributes(sequence: number, attributes: Record<string, AttributeValue>): void {
    for (const name of Object.keys(attributes)) {
      this.addAttribute(sequence, name, attributes[name]!);
    }
  }

  addContent(sequence: number, textOrFragment: string | number | boolean | null | undefined | RenderFragment): void {
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
      this.append({ frameType: FrameType.Attribute, sequence, attributeName: "ChildContent", attributeValue: fragment });
      return;
    }
    if (typeof textOrFragment === "function") {
      this.openRegion(sequence);
      textOrFragment(this);
      this.closeRegion();
    } else if (textOrFragment === null || textOrFragment === undefined || textOrFragment === false) {
      // Skip empty content (Blazor renders nothing for falsy expressions).
    } else if (typeof textOrFragment === "boolean") {
      // true renders nothing.
    } else {
      this.append({ frameType: FrameType.Text, sequence, textContent: textOrFragment });
    }
  }

  addMarkupContent(sequence: number, markup: string | null): void {
    if (markup === null || markup === undefined) return;
    this.append({ frameType: FrameType.Markup, sequence, markupContent: markup });
  }

  addElementReferenceCapture(sequence: number, action: (element: Element) => void): void {
    this.append({ frameType: FrameType.ElementReferenceCapture, sequence, elementReferenceCaptureAction: action });
  }

  /** Clears the builder for reuse. */
  clear(): void {
    this.frames.length = 0;
    this.openFrameStack.length = 0;
  }

  private append(frame: RenderTreeFrame): void {
    this.frames.push(frame);
  }

  private closeOpenFrame(): void {
    const index = this.openFrameStack.pop();
    if (index === undefined) {
      throw new Error("No open frame to close.");
    }
    const frame = this.frames[index]!;
    const subtreeLength = this.frames.length - index;
    if (frame.frameType === FrameType.Element) {
      this.frames[index] = { ...frame, elementSubtreeLength: subtreeLength };
    } else if (frame.frameType === FrameType.Component) {
      this.frames[index] = { ...frame, componentSubtreeLength: subtreeLength };
    } else if (frame.frameType === FrameType.Region) {
      this.frames[index] = { ...frame, regionSubtreeLength: subtreeLength };
    }
  }
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
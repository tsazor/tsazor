import type { ComponentBase } from "../components/component-base";
import type { ComponentDefinition } from "../components/component-definition";
import type { RenderTreeFrame } from "../render-tree/render-tree";
import type { RenderHandle } from "./render-handle";

/**
 * Renderer-side state for one component instance (Blazor's ComponentState).
 */
export class ComponentState {
  /** Delimits this component's output inside the parent DOM. */
  readonly startMarker: Comment;
  readonly endMarker: Comment;
  /** Direct child component states, keyed by the frame index in the current tree. */
  readonly slotChildren = new Map<number, ComponentState>();
  /** Slot children of the render pass currently being processed. */
  readonly newSlotChildren = new Map<number, ComponentState>();
  /** DOM nodes produced by the current render tree, indexed by frame index
   *  (holes for attribute/region frames). An array instead of a Map: frame
   *  indices are dense integers, so this halves the lookup/retention cost. */
  renderedNodes: Node[] = [];
  currentRenderTree: RenderTreeFrame[] = [];
  disposed = false;
  /** Mutable so HMR can replace the definition in place. */
  definition: ComponentDefinition;

  readonly renderHandle: RenderHandle;

  constructor(
    readonly id: number,
    readonly component: ComponentBase,
    definition: ComponentDefinition,
    readonly parent: ComponentState | null,
  ) {
    this.definition = definition;
    this.startMarker = document.createComment(`bl-tasor:${id}`);
    this.endMarker = document.createComment(`/bl-tasor:${id}`);
    this.renderHandle = {
      render: () => {
        /* set by the renderer to avoid a circular field initialization */
      },
      isRenderingInProgress: false,
      track: (promise) => promise,
    } as RenderHandle;
  }
}

/** A cascading value supplied by an ancestor CascadingValue component. */
export interface CascadeEntry {
  readonly value: unknown;
  readonly name?: string;
  readonly typeToken?: abstract new (...args: never[]) => unknown;
}
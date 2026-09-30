import type { ComponentBase } from "../components/component-base.js";
import type { ComponentDefinition } from "../components/component-definition.js";
import type { RenderTreeFrame } from "../render-tree/render-tree.js";
import { RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { RenderHandle } from "./render-handle.js";

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
  currentRenderTree: RenderTreeFrame[] = [];
  /** Two alternating builders: while one holds the previous tree (the diff
   *  source), the other builds the next pass - no builder or frame-array
   *  allocation per render pass (the frames themselves stay per-render). */
  readonly renderBuilders = [new RenderTreeBuilder(), new RenderTreeBuilder()] as const;
  /** Index of the builder for the NEXT pass (toggles per flush). */
  renderPass = 0;
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
    this.startMarker = document.createComment(`bl-tsazor:${id}`);
    this.endMarker = document.createComment(`/bl-tsazor:${id}`);
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
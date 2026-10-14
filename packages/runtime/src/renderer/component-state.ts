import type { ComponentBase } from "../components/component-base.js";
import type { ComponentDefinition } from "../components/component-definition.js";
import type { RenderTreeFrame } from "../render-tree/render-tree.js";
import { RenderTreeBuilder } from "../render-tree/render-tree.js";
import { LogicalRange } from "./logical-range.js";
import type { RenderHandle } from "./render-handle.js";

/**
 * Renderer-side state for one component instance (Blazor's ComponentState).
 */
export class ComponentState {
  /** Delimits this component's output inside the parent DOM (moved and removed as a unit). */
  readonly range: LogicalRange;
  /** Direct child component states, keyed by the frame index in the current tree. */
  readonly slotChildren = new Map<number, ComponentState>();
  /** Slot children of the render pass currently being processed. */
  readonly newSlotChildren = new Map<number, ComponentState>();
  /** The frames of the component's last completed render pass (Blazor's CurrentRenderTree). */
  currentRenderTree: RenderTreeFrame[] = [];
  /** Two alternating builders: while one holds the previous tree (the diff
   *  source), the other builds the next pass - no builder or frame-array
   *  allocation per render pass (the frames themselves stay per-render). */
  readonly renderBuilders = [new RenderTreeBuilder(), new RenderTreeBuilder()] as const;
  /** Index of the builder for the NEXT pass (toggles per flush). */
  renderPass = 0;
  /** Set once the component has been disposed; queued renders for it are then skipped. */
  disposed = false;
  /** Distance from the root component: the render queue's parent-first order. */
  readonly depth: number;
  /** @internal Render-queue bookkeeping (see RenderQueue). */
  renderQueued = false;
  /** @internal */
  renderQueueOrder = 0;
  /** @internal Render passes in the current batch (render-loop guard). */
  batchRenderCount = 0;
  /**
   * @internal Blazor's AddToRenderQueue(boundary, empty): a one-shot fragment
   * the component's NEXT render pass builds instead of its own output. Set by
   * the error-boundary routing (handleComponentError), consumed by
   * renderComponent — the error-state render is queued after it.
   */
  forcedRenderFragment: ((builder: RenderTreeBuilder) => void) | null = null;
  /**
   * @internal Cascading subscriptions (Blazor's CascadingParameterState):
   * the non-fixed suppliers this component's cascading parameters resolved
   * to (plus "pending" by-type candidates), null when there are none.
   */
  cascadingSuppliers: ComponentState[] | null = null;
  /** @internal Supplier side: the consumers subscribed to this component's cascadeValue. */
  subscribers: Set<ComponentState> | null = null;
  /** @internal Supplier side: cascadeValue at the last render pass (change detection). */
  lastCascadeValue: unknown = undefined;
  /**
   * @internal Blazor's _latestDirectParametersSnapshot: the parent-supplied
   * parameters of the last set, kept for components with cascading
   * parameters so a cascade notification can re-set them.
   */
  directParameters: ReadonlyMap<string, unknown> | null = null;
  /**
   * @internal `@SupplyParameterFromQuery` fields: the values last supplied from the URL's query,
   * null when the component has none (or the parent passes them all). A navigation re-sets the
   * parameters when one of them changes.
   */
  lastQueryValues: Map<string, unknown> | null = null;
  /** Mutable so HMR can replace the definition in place. */
  definition: ComponentDefinition;

  /** The component's `RenderHandle` (handed to it with componentInternals.attach); the renderer wires up its methods. */
  readonly renderHandle: RenderHandle;

  /** The comment node that marks the start of the component's DOM output. */
  get startMarker(): Comment {
    return this.range.start;
  }

  /** The comment node that marks the end of the component's DOM output. */
  get endMarker(): Comment {
    return this.range.end;
  }

  /**
   * Created by the renderer when it instantiates a component.
   */
  constructor(
    /** The renderer-wide component id (Blazor's ComponentId), also used in the range's marker comments. */
    readonly id: number,
    /** The component instance. */
    readonly component: ComponentBase,
    definition: ComponentDefinition,
    /** The parent component's state; `null` for a root component. */
    readonly parent: ComponentState | null,
  ) {
    this.definition = definition;
    // H2: each builder reuses unchanged keyed rows from the other one, which
    // holds the live tree while this one builds the next pass.
    this.renderBuilders[0].setReuseSource(this.renderBuilders[1]);
    this.renderBuilders[1].setReuseSource(this.renderBuilders[0]);
    this.depth = parent === null ? 0 : parent.depth + 1;
    this.range = new LogicalRange(`bl-tsazor:${id}`);
    this.renderHandle = {
      render: () => {
        /* set by the renderer to avoid a circular field initialization */
      },
      isRenderingInProgress: false,
      track: (promise) => promise,
      reportError: (error: unknown): void => {
        throw error;
      },
    } as Partial<RenderHandle> as RenderHandle;
  }
}

/** A cascading value supplied by an ancestor CascadingValue component. */
export interface CascadeEntry {
  /** The supplied value. */
  readonly value: unknown;
  /** The cascade name, matched case-insensitively against `CascadingParameter({ name })`. */
  readonly name?: string;
  /** The value's static type for by-type matching. */
  readonly typeToken?: abstract new (...args: never[]) => unknown;
}
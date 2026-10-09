/**
 * Blazor 11's Virtualize unit tests (aspnetcore src/Components/Web/test/Virtualization/VirtualizeTest.cs),
 * ported to Tsazor's Virtualize. Grouped as in docs/blazor-virtualize-net11.md §9; every test names the Blazor
 * test it ports.
 *
 * Blazor drives the component through a mocked IJSRuntime and calls the JS callbacks by hand. Here a fake
 * viewport takes the JS module's place (setVirtualizeViewportFactory): it records the calls and returns
 * defaults. The tests call `spacerBeforeVisible`/`spacerAfterVisible` directly and then wait for the renderer
 * (Blazor's Dispatcher.InvokeAsync plus the render it triggers). Where Tsazor fixes a Blazor bug
 * (docs/design-virtualize.md §6), the port asserts the fix and says so (`Tsazor deviation A<n>`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ComponentBase,
  Renderer,
  Virtualize,
  VirtualizeAnchorMode,
  type RenderError,
  type RenderFragment,
  type RenderTreeBuilder,
  type VirtualizeItemsProvider,
  type VirtualizeItemsProviderRequest,
} from "../src/index";
import { setVirtualizeViewportFactory } from "../src/data/virtualize";
import { SpacerVisibilityReason, type ViewportFillDirection, type VirtualizeViewport } from "../src/data/virtualize-viewport";
import { useCssomStyles } from "../src/renderer/dom-attributes";

/* Fake viewport (Blazor's Mock.Of<IJSRuntime>()) ------------------------- */

type ViewportMethod = Exclude<keyof VirtualizeViewport, "spacerStyle">;

interface ViewportCall {
  readonly method: ViewportMethod;
  readonly args: readonly unknown[];
}

/** Records every call the component makes and answers with defaults: nothing follows an edge, no row aligns. */
class FakeViewport implements VirtualizeViewport {
  readonly spacerStyle = "";
  readonly calls: ViewportCall[] = [];
  disposed = false;
  /** Calls after dispose (Blazor's GatedVirtualizeJsRuntime.InteropAttemptedAfterDisposal). */
  callsAfterDispose = 0;
  /** Runs on every call, so a test can act at the moment the component reaches a step (Blazor's gate). */
  onCall: ((method: ViewportMethod) => void) | undefined;

  constructor(readonly anchorMode: VirtualizeAnchorMode) {}

  afterRender(): void {
    this.record("afterRender");
  }
  scrollToBottom(): void {
    this.record("scrollToBottom");
  }
  refreshObservers(isLoading: boolean): void {
    this.record("refreshObservers", isLoading);
  }
  setAnchorMode(mode: number): void {
    this.record("setAnchorMode", mode);
  }
  restoreAnchor(): void {
    this.record("restoreAnchor");
  }
  prepareShift(): void {
    this.record("prepareShift");
  }
  alignToItem(localIndex: number): ViewportFillDirection | null {
    this.record("alignToItem", localIndex);
    return null;
  }
  beginProgrammaticScroll(): void {
    this.record("beginProgrammaticScroll");
  }
  isFollowingTop(): boolean {
    this.record("isFollowingTop");
    return false;
  }
  isFollowingBottom(): boolean {
    this.record("isFollowingBottom");
    return false;
  }
  dispose(): void {
    this.record("dispose");
    this.disposed = true;
  }

  called(method: ViewportMethod): boolean {
    return this.calls.some((call) => call.method === method);
  }

  private record(method: ViewportMethod, ...args: unknown[]): void {
    if (this.disposed) this.callsAfterDispose++;
    this.calls.push({ method, args });
    this.onCall?.(method);
  }
}

let viewports: FakeViewport[] = [];
/** Runs for each viewport the component creates (in its first onAfterRender). */
let onViewportCreated: ((viewport: FakeViewport) => void) | undefined;
let restoreViewportFactory: () => void = () => {};
/** The failures each mounted renderer reported; afterEach expects none the test did not take. */
let mountedErrors: RenderError[][] = [];

beforeEach(() => {
  viewports = [];
  onViewportCreated = undefined;
  mountedErrors = [];
  restoreViewportFactory = setVirtualizeViewportFactory((_callbacks, _spacerBefore, _spacerAfter, anchorMode) => {
    const viewport = new FakeViewport(anchorMode);
    viewports.push(viewport);
    onViewportCreated?.(viewport);
    return viewport;
  });
});

afterEach(() => {
  restoreViewportFactory();
  // A failure no test asked for is a crash (Blazor: an exception out of the renderer).
  for (const errors of mountedErrors) expect(errors).toEqual([]);
  document.body.innerHTML = "";
});

/* Host (Blazor's VirtualizeTestHostcomponent) ----------------------------- */

/** The Virtualize parameters the tests set, by their markup names. */
interface VirtualizeParameters<TItem> {
  Items?: readonly TItem[];
  ItemsProvider?: VirtualizeItemsProvider<TItem>;
  ChildContent?: (item: TItem) => RenderFragment;
  ItemSize?: number;
  OverscanCount?: number;
  MaxItemCount?: number;
  SpacerElement?: string;
  AnchorMode?: VirtualizeAnchorMode;
  InitialItemIndex?: number;
}

interface VirtualizeHost<TItem> {
  /** Renders again with the same parameters (Blazor's TriggerRender / RenderRootComponentAsync). */
  rerender(): void;
  /** Renders again with these parameters changed. */
  update(changes: VirtualizeParameters<TItem>): void;
  /** Renders without the Virtualize, which disposes it (Blazor: `InnerContent = null`). */
  remove(): void;
}

interface MountedVirtualize<TItem> {
  readonly renderer: Renderer;
  readonly host: VirtualizeHost<TItem>;
  /** The scroll container (`overflow: auto; height: 800px`) the Virtualize renders into. */
  readonly container: HTMLElement;
  /** Failures the renderer reported; a test that expects one takes it out (`takeErrors`). */
  readonly errors: RenderError[];
  readonly virtualize: Virtualize<TItem>;
  readonly viewport: FakeViewport;
}

/** Mounts the host; the first render runs once the caller yields (await `renderer.waitUntilIdle()`). */
function mountVirtualize<TItem>(parameters: VirtualizeParameters<TItem>): MountedVirtualize<TItem> {
  let current: VirtualizeParameters<TItem> | null = { ...parameters };
  let captured: Virtualize<TItem> | undefined;

  class Host extends ComponentBase implements VirtualizeHost<TItem> {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "div");
      b.addAttribute(1, "style", "overflow: auto; height: 800px;");
      if (current !== null) {
        b.openComponent(2, Virtualize);
        let sequence = 3;
        for (const [name, value] of Object.entries(current)) {
          if (value !== undefined) b.addComponentParameter(sequence++, name, value);
        }
        b.addComponentReferenceCapture(100, (component) => {
          captured = component as Virtualize<TItem>;
        });
        b.closeComponent();
      }
      b.closeElement();
    }

    rerender(): void {
      this.stateHasChanged();
    }

    update(changes: VirtualizeParameters<TItem>): void {
      current = { ...current, ...changes };
      this.stateHasChanged();
    }

    remove(): void {
      current = null;
      this.stateHasChanged();
    }
  }

  const root = document.createElement("div");
  document.body.appendChild(root);
  const renderer = new Renderer();
  const errors: RenderError[] = [];
  renderer.errorHandler = (error) => errors.push(error);
  const host = renderer.renderInContainer(Host, root).component as Host;
  const m: MountedVirtualize<TItem> = {
    renderer,
    host,
    errors,
    get container() {
      return root.firstElementChild as HTMLElement;
    },
    get virtualize() {
      if (captured === undefined) throw new Error("The Virtualize has not rendered.");
      return captured;
    },
    get viewport() {
      const viewport = viewports.at(-1);
      if (viewport === undefined) throw new Error("The Virtualize created no viewport.");
      return viewport;
    },
  };
  mountedErrors.push(errors);
  return m;
}

/** Mounts the host and waits for the first render. */
async function renderVirtualize<TItem>(parameters: VirtualizeParameters<TItem>): Promise<MountedVirtualize<TItem>> {
  const m = mountVirtualize(parameters);
  await m.renderer.waitUntilIdle();
  return m;
}

/** Blazor's CreateRenderedVirtualize: an ItemsProvider over `totalItems` numbers. */
function createRenderedVirtualize(
  itemSize: number,
  totalItems: number,
  customProvider?: VirtualizeItemsProvider<number>,
  childContent?: (item: number) => RenderFragment,
): Promise<MountedVirtualize<number>> {
  return renderVirtualize<number>({
    ItemSize: itemSize,
    ItemsProvider: customProvider ?? rangeProvider(totalItems),
    ChildContent: childContent,
  });
}

/** Removes and returns the failures reported so far (they are expected, so afterEach doesn't flag them). */
function takeErrors(m: { readonly errors: RenderError[] }): RenderError[] {
  return m.errors.splice(0);
}

/* Items, providers, templates --------------------------------------------- */

/** Blazor's Enumerable.Range. */
function range(start: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => start + i);
}

/** A provider over the numbers 0 to totalItems - 1 that records its requests. */
function rangeProvider(totalItems: number, requests?: VirtualizeItemsProviderRequest[]): VirtualizeItemsProvider<number> {
  return async (request) => {
    requests?.push(request);
    return {
      items: range(request.startIndex, Math.min(request.count, totalItems - request.startIndex)),
      totalItemCount: totalItems,
    };
  };
}

/** A provider over a mutable list (Blazor's `items.Skip(start).Take(count)`). */
function listProvider(items: readonly number[]): VirtualizeItemsProvider<number> {
  return async (request) => ({
    items: items.slice(request.startIndex, request.startIndex + request.count),
    totalItemCount: items.length,
  });
}

/** Blazor's SimpleItemTemplate: the item as text. */
const simpleItemTemplate = (item: number): RenderFragment => (b) => b.addContent(0, item);

/** BuildVirtualizeWithContent's template: the item in a span. */
const spanItemTemplate = (item: number): RenderFragment => (b) => {
  b.openElement(0, "span");
  b.addContent(1, String(item));
  b.closeElement();
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Runs every queued microtask: renders and provider continuations, without waiting for pending work. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Rejects when `promise` hasn't settled within `ms` (Blazor's `WaitAsync(timeout)`). */
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Not settled within ${ms} ms.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The object on `value`'s prototype chain that declares `key` (where a spy on an accessor must go). */
function prototypeOwning<T extends object>(value: T, key: PropertyKey): T {
  for (let candidate: object | null = value; candidate !== null; candidate = Object.getPrototypeOf(candidate)) {
    if (Object.hasOwn(candidate, key)) return candidate as T;
  }
  throw new Error(`Nothing on the prototype chain declares ${String(key)}.`);
}

/** The two spacers: the first and the last element the Virtualize renders into its parent. */
function spacersOf(parent: Element): { before: HTMLElement; after: HTMLElement } {
  return { before: parent.firstElementChild as HTMLElement, after: parent.lastElementChild as HTMLElement };
}

/* A. Basic rendering, parameter validation and the fill loop -------------- */

describe("A. Basic rendering, parameter validation and the fill loop", () => {
  it("throws when ItemSize is not positive", async () => {
    // Blazor: Virtualize_ThrowsWhenGivenNonPositiveItemSize
    const m = await renderVirtualize<number>({ ItemSize: 0, ItemsProvider: rangeProvider(0) });

    const [failure, ...rest] = takeErrors(m);
    expect(rest).toEqual([]);
    expect(failure?.phase).toBe("lifecycle");
    expect((failure?.error as Error).message).toContain("requires a positive value for parameter");
  });

  it("throws when given both Items and ItemsProvider", async () => {
    // Blazor: Virtualize_ThrowsWhenGivenMultipleItemSources
    const m = await renderVirtualize<number>({ ItemSize: 10, ItemsProvider: rangeProvider(0), Items: [] });

    const [failure, ...rest] = takeErrors(m);
    expect(rest).toEqual([]);
    expect(failure?.phase).toBe("lifecycle");
    expect((failure?.error as Error).message).toContain("can only accept one item source from its parameters");
  });

  it("throws when given neither Items nor ItemsProvider", async () => {
    // Blazor: Virtualize_ThrowsWhenGivenNoItemSources
    const m = await renderVirtualize<number>({ ItemSize: 10 });

    const [failure, ...rest] = takeErrors(m);
    expect(rest).toEqual([]);
    expect(failure?.phase).toBe("lifecycle");
    expect((failure?.error as Error).message).toContain("parameters to be specified and non-null");
  });

  it("a visible before spacer with measurements triggers a provider fetch", async () => {
    // Blazor: Virtualize_OnBeforeSpacerVisible_MeasuredSpacerTriggersProviderFetch
    const requests: VirtualizeItemsProviderRequest[] = [];
    const { virtualize, renderer } = await createRenderedVirtualize(50, 100, rangeProvider(100, requests));
    const countBefore = requests.length;

    virtualize.spacerBeforeVisible(100, 300, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(requests.length).toBeGreaterThan(countBefore);
  });

  it("renders the items without wrapper elements, and no element of its own", async () => {
    // Blazor: Virtualize_RendersItemsWithoutWrapperElements
    // Also carries data.test.ts's "renders no element of its own": the spacers and the rows sit in the parent.
    const m = await renderVirtualize<number>({ ItemSize: 50, Items: [1, 2, 3], ChildContent: spanItemTemplate });

    m.virtualize.spacerAfterVisible(0, 150, 500, SpacerVisibilityReason.ViewportFill);
    await m.renderer.waitUntilIdle();

    const children = [...m.container.children];
    expect(children.map((child) => child.tagName)).toEqual(["DIV", "SPAN", "SPAN", "SPAN", "DIV"]);
    expect(children.slice(1, -1).map((child) => child.textContent)).toEqual(["1", "2", "3"]);
    expect(children[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(children.at(-1)!.getAttribute("aria-hidden")).toBe("true");
    expect(m.container.querySelector(".virtualize-item")).toBeNull();
  });

  it("the first render does not shift the start index away from zero", async () => {
    // Blazor: Virtualize_FirstRender_DoesNotShiftStartIndexAwayFromZero
    const requests: VirtualizeItemsProviderRequest[] = [];
    const { virtualize, renderer } = await createRenderedVirtualize(50, 100, rangeProvider(100, requests));
    const callCountAfterMount = requests.length;

    virtualize.spacerBeforeVisible(50, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(requests.length).toBe(callCountAfterMount + 1);
    expect(requests.at(-1)!.startIndex).toBe(0);
  });

  it("with both spacers visible and a small item count, it measures and does not crash", async () => {
    // Blazor: Virtualize_BothSpacersVisible_SmallItemCountDoesNotCrash
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, Items: [1, 2, 3], ChildContent: spanItemTemplate });

    virtualize.spacerAfterVisible(0, 150, 1000, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible(0, 150, 1000, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerAfterVisible(0, 150, 1000, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.measuredItemCount).toBeGreaterThan(0);
  });

  it("a user-scroll before-spacer report moves the window toward the top", async () => {
    // Blazor: OnBeforeSpacerVisible_UserScroll_MovesWindowTowardTop
    const { virtualize, renderer } = await createRenderedVirtualize(50, 1000);
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible(5000, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const itemsBeforeAtTarget = virtualize.itemsBefore;
    expect(itemsBeforeAtTarget).toBeGreaterThan(0);

    // The top of the list in view, by the user's own scroll.
    virtualize.spacerBeforeVisible(0, 500, 500, SpacerVisibilityReason.UserScroll);
    await renderer.waitUntilIdle();

    expect(virtualize.itemsBefore).toBeLessThan(itemsBeforeAtTarget);
  });
});

/* B. ItemsProvider, cancellation, refresh, data changes ------------------- */

describe("B. ItemsProvider, cancellation, refresh, data changes", () => {
  it("dispatches exceptions from the items provider through the renderer", async () => {
    // Blazor: Virtualize_DispatchesExceptionsFromItemsProviderThroughRenderer
    const alwaysThrows: VirtualizeItemsProvider<number> = () => {
      throw new Error("Thrown from items provider.");
    };
    const m = await renderVirtualize<number>({ ItemSize: 10, ItemsProvider: alwaysThrows });
    expect(m.errors).toEqual([]);

    m.virtualize.spacerAfterVisible(10, 50, 100, SpacerVisibilityReason.ViewportFill);
    await m.renderer.waitUntilIdle();

    // The load stores the exception and the next render throws it, so it reaches an error boundary.
    const [failure, ...rest] = takeErrors(m);
    expect(rest).toEqual([]);
    expect(failure?.phase).toBe("render");
    expect((failure?.error as Error).message).toBe("Thrown from items provider.");
  });

  it("a non-zero start index reaches the items provider", async () => {
    // Blazor: Virtualize_NonZeroStartIndex_ItemsProviderReceivesCorrectStartIndex
    const requests: VirtualizeItemsProviderRequest[] = [];
    const { virtualize, renderer } = await createRenderedVirtualize(50, 500, rangeProvider(500, requests));

    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible(5000, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(requests.some((request) => request.startIndex > 0)).toBe(true);
  });

  it("rapid scrolling cancels stale provider requests", async () => {
    // Blazor: Virtualize_RapidScrollCancellation_StaleRequestsCancelled
    const pendingCalls: Array<{ request: VirtualizeItemsProviderRequest; result: Deferred<{ items: number[]; totalItemCount: number }> }> = [];
    const delayedProvider: VirtualizeItemsProvider<number> = (request) => {
      const result = deferred<{ items: number[]; totalItemCount: number }>();
      pendingCalls.push({ request, result });
      return result.promise;
    };
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, ItemsProvider: delayedProvider });

    // The requests stay pending, so the renderer is never idle here: flush instead of waiting.
    virtualize.spacerAfterVisible(0, 0, 500, SpacerVisibilityReason.ViewportFill);
    await flushMicrotasks();
    expect(pendingCalls).toHaveLength(1);
    const firstCall = pendingCalls[0]!;

    virtualize.spacerAfterVisible(0, 0, 1000, SpacerVisibilityReason.ViewportFill);
    await flushMicrotasks();
    expect(pendingCalls).toHaveLength(2);
    const secondCall = pendingCalls[1]!;

    expect(firstCall.request.signal.aborted).toBe(true);
    expect(secondCall.request.signal.aborted).toBe(false);
    // Nothing rendered, so nothing was measured: what hasn't rendered can't be measured.
    expect(virtualize.measuredItemCount).toBe(0);
    expect(virtualize.totalMeasuredHeight).toBe(0);

    for (const call of pendingCalls) call.result.resolve({ items: [], totalItemCount: 0 });
    await renderer.waitUntilIdle();
  });

  it("a cancelled prepend adjustment does not overwrite a newer window", async () => {
    // Blazor: Virtualize_CanceledPrependAdjustment_DoesNotOverwriteNewerWindow
    const items = range(0, 200);
    let blockAdjustedRequest = false;
    const blockedRequestStarted = deferred<VirtualizeItemsProviderRequest>();
    const releaseBlockedRequest = deferred();
    const provider: VirtualizeItemsProvider<number> = async (request) => {
      if (blockAdjustedRequest && request.startIndex === 120) {
        blockAdjustedRequest = false;
        blockedRequestStarted.resolve(request);
        await releaseBlockedRequest.promise;
      }
      return { items: items.slice(request.startIndex, request.startIndex + request.count), totalItemCount: items.length };
    };
    const { virtualize, renderer } = await createRenderedVirtualize(50, items.length, provider, simpleItemTemplate);

    virtualize.spacerAfterVisible(0, 0, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible((100 + 15) * 50, 40 * 50, 500, SpacerVisibilityReason.UserScroll);
    await renderer.waitUntilIdle();
    expect(virtualize.itemsBefore).toBe(100);

    items.unshift(...range(-20, 20));
    blockAdjustedRequest = true;
    const canceledRefresh = virtualize.refreshData();
    const blockedRequest = await blockedRequestStarted.promise;

    virtualize.itemsBefore = 130;
    await virtualize.refreshData();

    expect(blockedRequest.signal.aborted).toBe(true);
    expect(virtualize.itemsBefore).toBe(150);

    releaseBlockedRequest.resolve();
    await canceledRefresh;

    expect(virtualize.itemsBefore).toBe(150);
    await renderer.waitUntilIdle();
  });

  it("with an items provider, a growing total count is not taken for a prepend", async () => {
    // Blazor: Virtualize_ItemsProvider_GrowingTotalCount_DoesNotAssumePrepend
    let totalCount = 100;
    const growingProvider: VirtualizeItemsProvider<number> = async (request) => ({
      items: range(request.startIndex, Math.min(request.count, totalCount - request.startIndex)),
      totalItemCount: totalCount,
    });
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, ItemsProvider: growingProvider });

    virtualize.spacerAfterVisible(0, 800, 800, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const itemsBeforeAfterInit = virtualize.itemsBefore;

    // New data arrives at the end; the refresh is driven by the spacer, not by refreshData.
    totalCount = 120;
    virtualize.spacerAfterVisible(0, 800, 800, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    // The window may move with the redistribution, but not by exactly the count delta (a false prepend).
    expect(virtualize.itemsBefore - itemsBeforeAfterInit).not.toBe(20);
  });

  it("a prepended single-pass result is not enumerated more than once", async () => {
    // Blazor: Virtualize_ItemsProvider_PrependedSinglePassEnumerable_IsNotEnumeratedMoreThanOnce
    const items = range(0, 100);
    let returnSinglePass = false;
    /** How often each single-pass result was enumerated, in the order the provider returned them. */
    const enumerations: number[] = [];
    const singlePass = (source: readonly number[]): Iterable<number> => {
      const slot = enumerations.push(0) - 1;
      return {
        *[Symbol.iterator]() {
          enumerations[slot]! += 1;
          if (enumerations[slot]! > 1) throw new Error("The provider result was enumerated more than once.");
          yield* source;
        },
      };
    };
    const provider: VirtualizeItemsProvider<number> = async (request) => {
      const requested = items.slice(request.startIndex, request.startIndex + Math.min(request.count, items.length - request.startIndex));
      return { items: returnSinglePass ? singlePass(requested) : requested, totalItemCount: items.length };
    };
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, ItemsProvider: provider, ChildContent: simpleItemTemplate });
    virtualize.spacerAfterVisible(0, 800, 800, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const itemsBeforePrepend = virtualize.itemsBefore;

    items.unshift(...range(-20, 20));
    returnSinglePass = true;
    await virtualize.refreshData();
    await renderer.waitUntilIdle();

    expect(virtualize.itemsBefore).toBe(itemsBeforePrepend + 20);
    // Blazor counts 1 in total: it enumerates the look-ahead result once to compare, and the result of the
    // re-request at the shifted window (the look-ahead doesn't cover it) is enumerated only by a render the
    // test never triggers. Tsazor materializes every provider result once, on arrival, so that second result
    // counts too. The point stands: no result is enumerated twice.
    expect(enumerations.length).toBeGreaterThan(0);
    expect(enumerations.filter((count) => count !== 1)).toEqual([]);
  });

  it.each([
    { prepend: false, expectedItemsBefore: 130 },
    { prepend: true, expectedItemsBefore: 140 },
  ])(
    "growth while the window moves past the previous first item tells a prepend from an append (prepend: $prepend)",
    async ({ prepend, expectedItemsBefore }) => {
      // Blazor: Virtualize_ItemsProvider_GrowthWhileWindowMovesPastPreviousFirstItem_DistinguishesPrependFromAppend
      const items = range(0, 200);
      const { virtualize, renderer } = await createRenderedVirtualize(50, items.length, listProvider(items), simpleItemTemplate);

      virtualize.spacerAfterVisible(0, 0, 500, SpacerVisibilityReason.ViewportFill);
      await renderer.waitUntilIdle();
      virtualize.spacerBeforeVisible((100 + 15) * 50, 40 * 50, 500, SpacerVisibilityReason.UserScroll);
      await renderer.waitUntilIdle();
      expect(virtualize.itemsBefore).toBe(100);

      if (prepend) items.unshift(...range(-10, 10));
      else items.push(...range(200, 10));

      virtualize.spacerBeforeVisible((130 + 15) * 50, 40 * 50, 500, SpacerVisibilityReason.UserScroll);
      await renderer.waitUntilIdle();

      expect(virtualize.itemsBefore).toBe(expectedItemsBefore);
    },
  );

  it("Items of a value type: an append is not taken for a prepend", async () => {
    // Blazor: Virtualize_DefaultProvider_ValueTypeItem_AppendDoesNotAssumePrepend
    const items = range(1, 100);
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, Items: items, ChildContent: spanItemTemplate });

    virtualize.spacerAfterVisible(0, 800, 800, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const itemsBeforeAfterInit = virtualize.itemsBefore;

    // Append 20 at the end: items[0] is unchanged, this is not a prepend. The spacer-driven refresh reads the
    // list again and sees it grow from 100 to 120.
    items.push(...range(101, 20));
    virtualize.spacerAfterVisible(0, 800, 800, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.itemsBefore - itemsBeforeAfterInit).not.toBe(20);
    // Tsazor deviation A5: the window shifts by how far the previously first row moved, and an append moves no
    // row. So the window stays where this report's redistribution puts it: the 46 rows measured over 800px give
    // a capacity of 800 / (800 / 46) + 2 × 15 = 76, so the window starts at 100 − 76 = 24. (Blazor compares the
    // previously first item, at index 54, with the item at the new start, 24; they differ, so it shifts by the
    // whole delta, to min(24 + 20, 120 − 76) = 44.)
    expect(virtualize.itemsBefore).toBe(24);
  });
});

/* C. MaxItemCount and OverscanCount --------------------------------------- */

describe("C. MaxItemCount and OverscanCount", () => {
  it("MaxItemCount clamps the visible item capacity", async () => {
    // Blazor: MaxItemCount_ClampsVisibleItemCapacity
    const requests: VirtualizeItemsProviderRequest[] = [];
    const { virtualize, renderer } = await renderVirtualize<number>({
      ItemSize: 10,
      ItemsProvider: rangeProvider(1000, requests),
      MaxItemCount: 20,
    });

    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    // 500px of 10px rows would be 50 + 2 × 15 overscan; MaxItemCount 20 + 2 × 15 caps it at 50.
    expect(requests.at(-1)!.count).toBeLessThanOrEqual(50);
  });
});

/* D. Tables --------------------------------------------------------------- */

describe("D. Tables", () => {
  it("with SpacerElement tr, the items render directly between tr spacers", async () => {
    // Blazor: Virtualize_TableSpacerElement_RendersItemsDirectlyWithTrSpacers
    const m = await renderVirtualize<number>({ ItemSize: 50, Items: [1, 2, 3], ChildContent: spanItemTemplate, SpacerElement: "tr" });

    m.virtualize.spacerAfterVisible(0, 150, 500, SpacerVisibilityReason.ViewportFill);
    await m.renderer.waitUntilIdle();

    const { before, after } = spacersOf(m.container);
    expect(before.tagName).toBe("TR");
    expect(after.tagName).toBe("TR");
    expect([...m.container.children].slice(1, -1).map((child) => child.tagName)).toEqual(["SPAN", "SPAN", "SPAN"]);
  });

  it("inside a tbody, the tr spacers and the rows are the tbody's own children", async () => {
    // From data.test.ts ("renders the spacers as the given element (a tr inside a tbody)"); no Blazor unit test.
    let virtualize: Virtualize<string> | undefined;
    class TablePage extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "table");
        b.openElement(1, "tbody");
        b.openComponent(2, Virtualize);
        b.addComponentParameter(3, "Items", ["a", "b"]);
        b.addComponentParameter(4, "SpacerElement", "tr");
        b.addComponentParameter(5, "ChildContent", (item: string): RenderFragment => (inner) => {
          inner.openElement(0, "tr");
          inner.openElement(1, "td");
          inner.addContent(2, item);
          inner.closeElement();
          inner.closeElement();
        });
        b.addComponentReferenceCapture(6, (component) => {
          virtualize = component as Virtualize<string>;
        });
        b.closeComponent();
        b.closeElement();
        b.closeElement();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    renderer.renderInContainer(TablePage, container);
    await renderer.waitUntilIdle();

    virtualize!.spacerAfterVisible(0, 0, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    const rows = [...container.querySelectorAll("tbody > tr")];
    expect(rows.map((row) => (row.getAttribute("aria-hidden") === "true" ? "spacer" : row.textContent))).toEqual(["spacer", "a", "b", "spacer"]);
  });
});

/* E. Measurement ---------------------------------------------------------- */

describe("E. Measurement", () => {
  it("measurements update the running average", async () => {
    // Blazor: Virtualize_MeasurementsUpdateRunningAverage
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, Items: range(1, 100), ChildContent: spanItemTemplate });

    // The first report makes rows render; the second measures them (separation over the rendered count).
    virtualize.spacerAfterVisible(0, 80, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerAfterVisible(0, 80, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.totalMeasuredHeight).toBeGreaterThan(0);
    expect(virtualize.measuredItemCount).toBeGreaterThan(0);
  });

  it("a zero spacer separation does not corrupt the average", async () => {
    // Blazor: Virtualize_ZeroSpacerSeparationDoesNotCorruptAverage
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, Items: range(1, 100), ChildContent: spanItemTemplate });
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const heightAfterValid = virtualize.totalMeasuredHeight;
    const countAfterValid = virtualize.measuredItemCount;
    expect(heightAfterValid).toBeGreaterThan(0);

    virtualize.spacerAfterVisible(0, 0, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.totalMeasuredHeight).toBe(heightAfterValid);
    expect(virtualize.measuredItemCount).toBe(countAfterValid);
  });

  it("a NaN spacer separation does not crash the component", async () => {
    // Blazor: Virtualize_NaNSpacerSeparationDoesNotCrashComponent
    // Tsazor deviation A1: only finite, positive measurements count. Blazor's guard (`<= 0`) lets NaN through,
    // and its test only checks that requests continue. The port renders rows (Blazor's has no template, so
    // nothing could be measured at all) and also asserts that the average stays as it was and the spacers keep
    // finite heights.
    const requests: VirtualizeItemsProviderRequest[] = [];
    const m = await createRenderedVirtualize(50, 100, rangeProvider(100, requests), simpleItemTemplate);
    const { virtualize, renderer } = m;
    virtualize.spacerAfterVisible(0, 100, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const countAfterBaseline = requests.length;
    const heightBefore = virtualize.totalMeasuredHeight;
    const measuredCountBefore = virtualize.measuredItemCount;
    expect(virtualize.lastRenderedItemCount).toBeGreaterThan(0);

    virtualize.spacerAfterVisible(0, Number.NaN, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible(50, Number.NaN, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(requests.length).toBeGreaterThan(countAfterBaseline);
    expect(virtualize.totalMeasuredHeight).toBe(heightBefore);
    expect(virtualize.measuredItemCount).toBe(measuredCountBefore);
    const { before, after } = spacersOf(m.container);
    expect(Number.isFinite(Number.parseFloat(before.style.height))).toBe(true);
    expect(Number.isFinite(Number.parseFloat(after.style.height))).toBe(true);
  });

  it("a negative spacer separation does not crash the component", async () => {
    // Blazor: Virtualize_NegativeSpacerSeparationDoesNotCrashComponent
    const requests: VirtualizeItemsProviderRequest[] = [];
    const { virtualize, renderer } = await createRenderedVirtualize(50, 100, rangeProvider(100, requests));
    virtualize.spacerAfterVisible(0, 100, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const heightBefore = virtualize.totalMeasuredHeight;
    const countBefore = virtualize.measuredItemCount;

    // A negative separation gives a negative item height: it must not count toward the average.
    virtualize.spacerAfterVisible(0, -500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible(50, -100, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.totalMeasuredHeight).toBe(heightBefore);
    expect(virtualize.measuredItemCount).toBe(countBefore);
  });

  it("an infinite spacer separation does not crash the component", async () => {
    // Blazor: Virtualize_InfinitySpacerSeparationDoesNotCrashComponent
    // Tsazor deviation A1: as with NaN, ∞ doesn't count (Blazor accumulates it, and the average becomes ∞).
    // The port renders rows so the guard is exercised, and asserts the average and the spacers stay finite.
    const requests: VirtualizeItemsProviderRequest[] = [];
    const m = await createRenderedVirtualize(50, 100, rangeProvider(100, requests), simpleItemTemplate);
    const { virtualize, renderer } = m;
    virtualize.spacerAfterVisible(0, 100, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const countAfterBaseline = requests.length;
    const heightBefore = virtualize.totalMeasuredHeight;
    const measuredCountBefore = virtualize.measuredItemCount;
    expect(virtualize.lastRenderedItemCount).toBeGreaterThan(0);

    // MaxItemCount caps the capacity, so an infinite separation can't overflow it.
    virtualize.spacerAfterVisible(0, Number.POSITIVE_INFINITY, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible(50, Number.POSITIVE_INFINITY, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(requests.length).toBeGreaterThan(countAfterBaseline);
    expect(virtualize.totalMeasuredHeight).toBe(heightBefore);
    expect(virtualize.measuredItemCount).toBe(measuredCountBefore);
    const { before, after } = spacersOf(m.container);
    expect(Number.isFinite(Number.parseFloat(before.style.height))).toBe(true);
    expect(Number.isFinite(Number.parseFloat(after.style.height))).toBe(true);
  });

  it("refreshData resets the running average", async () => {
    // Blazor: Virtualize_RefreshDataAsync_ResetsRunningAverage
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, Items: range(1, 100), ChildContent: spanItemTemplate });
    for (let i = 0; i < 10; i++) {
      virtualize.spacerAfterVisible(0, 90, 500, SpacerVisibilityReason.ViewportFill);
      await renderer.waitUntilIdle();
    }
    expect(virtualize.measuredItemCount).toBeGreaterThan(0);

    await virtualize.refreshData();
    await renderer.waitUntilIdle();

    expect(virtualize.totalMeasuredHeight).toBe(0);
    expect(virtualize.measuredItemCount).toBe(0);
  });

  it("with fixed Items, measurements accumulate without breaking rendering", async () => {
    // Blazor: Virtualize_FixedItems_MeasurementsAccumulateWithoutBreakingRendering
    const { virtualize, renderer } = await renderVirtualize<number>({ ItemSize: 50, Items: range(1, 20), ChildContent: spanItemTemplate });
    expect(virtualize.totalMeasuredHeight).toBe(0);
    expect(virtualize.measuredItemCount).toBe(0);

    // The first report renders rows (sets the rendered count); the second measures them.
    virtualize.spacerAfterVisible(0, 1000, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerAfterVisible(0, 1000, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.totalMeasuredHeight).toBeGreaterThan(0);
    expect(virtualize.measuredItemCount).toBeGreaterThan(0);
  });
});

/* G. AnchorMode ----------------------------------------------------------- */

describe("G. AnchorMode", () => {
  it("in End mode at the end with new measurements, it scrolls to the bottom", async () => {
    // Blazor: Virtualize_ScrollToBottom_SetWhenAtEndWithNewMeasurements
    const m = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(1, 100),
      ChildContent: spanItemTemplate,
      AnchorMode: VirtualizeAnchorMode.End,
    });

    m.virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await m.renderer.waitUntilIdle();
    // The after spacer at size 0 is the very bottom; with rows rendered, this report measures them.
    m.virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await m.renderer.waitUntilIdle();

    expect(m.viewport.called("scrollToBottom") || m.virtualize.pendingScrollToBottom).toBe(true);
  });

  it("not at the end, it does not scroll to the bottom", async () => {
    // Blazor: Virtualize_ScrollToBottom_NotSetWhenNotAtEnd
    const { virtualize, renderer } = await createRenderedVirtualize(50, 100);

    // Many items remain after the viewport.
    virtualize.spacerAfterVisible(5000, 1000, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.pendingScrollToBottom).toBe(false);
  });

  it("without new measurements, it does not scroll to the bottom", async () => {
    // Blazor: Virtualize_ScrollToBottom_NotSetWhenMeasurementsNotApplied
    // Tsazor: Blazor runs this in Start mode, where the missing End flag alone keeps the flag off (spec appendix
    // A.12). The port runs in End mode, so only the missing measurement can keep it off.
    const { virtualize, renderer } = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(1, 100),
      ChildContent: spanItemTemplate,
      AnchorMode: VirtualizeAnchorMode.End,
    });

    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    expect(virtualize.lastRenderedItemCount).toBeGreaterThan(0);
    virtualize.pendingScrollToBottom = false;

    // At the bottom with a zero separation: no new measurement.
    virtualize.spacerAfterVisible(0, 0, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.pendingScrollToBottom).toBe(false);
  });
});

/* J. InitialItemIndex ----------------------------------------------------- */

describe("J. InitialItemIndex", () => {
  it("a measurement does not change the spacers until positioning completes", async () => {
    // Blazor: InitialIndex_MeasurementDoesNotChangeSpacerUntilPositioningCompletes
    const m = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(0, 1000),
      InitialItemIndex: 950,
      OverscanCount: 3,
      ChildContent: simpleItemTemplate,
    });

    m.virtualize.spacerBeforeVisible(0, 1253, 2000, SpacerVisibilityReason.RenderedContentMeasurement);
    await m.renderer.waitUntilIdle();
    m.host.rerender();
    await m.renderer.waitUntilIdle();

    expect(m.virtualize.totalMeasuredHeight).toBe(1253);
    expect(m.virtualize.measuredItemCount).toBe(7);
    // Still the estimate: 947 × 50 above the window, 46 × 50 below it.
    const { before, after } = spacersOf(m.container);
    expect(before.style.height).toBe("47350px");
    expect(after.style.height).toBe("2300px");
  });

  it("applying the measured geometry preserves the running average", async () => {
    // Blazor: InitialIndex_ApplyingMeasuredGeometry_PreservesRunningAverage
    const { virtualize, renderer } = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(0, 7),
      InitialItemIndex: 5,
      OverscanCount: 3,
      ChildContent: simpleItemTemplate,
    });

    virtualize.spacerBeforeVisible(0, 1253, 2000, SpacerVisibilityReason.RenderedContentMeasurement);
    await renderer.waitUntilIdle();
    virtualize.spacerAfterVisible(0, 1253, 2000, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.totalMeasuredHeight).toBe(2506);
    expect(virtualize.measuredItemCount).toBe(14);
  });

  it("InitialItemIndex round-trips as a parameter", async () => {
    // Blazor: InitialIndex_ParameterRoundTrip
    const { virtualize } = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(1, 100),
      InitialItemIndex: 42,
      ChildContent: spanItemTemplate,
    });

    expect(virtualize.initialItemIndex).toBe(42);
  });

  it("a short list that fits, with the target on screen, does not stall", async () => {
    // Blazor: InitialIndex_ShortListThatFits_TargetOnScreenWithoutScroll_DoesNotStall
    const { virtualize, renderer } = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(1, 10),
      InitialItemIndex: 8,
      ChildContent: simpleItemTemplate,
    });
    // 10 items and a seed capacity of 2 × 15 + 1 = 31: the window clamps to the top, and item 8 is rendered.
    expect(virtualize.itemsBefore).toBe(0);

    // No user scroll happened; an after-spacer ViewportFill is still processed and keeps the window at the top.
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    expect(virtualize.itemsBefore).toBe(0);
  });

  it("the default 0 means no initial scroll", async () => {
    // Blazor: InitialIndex_DefaultZeroMeansNoInitialScroll
    const m = await renderVirtualize<number>({ ItemSize: 50, Items: range(1, 100), ChildContent: spanItemTemplate });

    expect(m.virtualize.initialItemIndex).toBe(0);
    expect(m.virtualize.itemsBefore).toBe(0);
    // No initial-scroll request was issued.
    expect(m.viewport.called("beginProgrammaticScroll")).toBe(false);
    expect(m.viewport.called("alignToItem")).toBe(false);
  });

  it("a negative InitialItemIndex clamps to 0", async () => {
    // Blazor: InitialIndex_NegativeClampsToZero
    const { virtualize } = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(1, 100),
      InitialItemIndex: -5,
      ChildContent: simpleItemTemplate,
    });

    expect(virtualize.initialItemIndex).toBe(-5);
    expect(virtualize.itemsBefore).toBe(0);
  });

  it("an InitialItemIndex beyond the count clamps to the end", async () => {
    // Blazor: InitialIndex_BeyondCountClampsToEnd
    const { virtualize } = await renderVirtualize<number>({
      ItemSize: 50,
      Items: range(1, 100),
      InitialItemIndex: 99_999,
      ChildContent: simpleItemTemplate,
    });

    expect(virtualize.initialItemIndex).toBe(99_999);
    // With Items the count is known, so the seed clamps to max(0, 100 − (2 × 15 + 1)) = 69.
    expect(virtualize.itemsBefore).toBe(69);
  });
});

/* K. scrollToItem --------------------------------------------------------- */

describe("K. scrollToItem", () => {
  it("throws before the first render", () => {
    // Blazor: ScrollToIndexAsync_ThrowsBeforeJsInteropInitialized
    const virtualize = new Virtualize<number>();

    expect(() => virtualize.scrollToItem(0)).toThrow(/scrollToItem[\s\S]*InitialItemIndex/);
  });

  it("a negative index does not throw", async () => {
    // Blazor: ScrollToIndexAsync_NegativeIndexDoesNotThrow
    const { virtualize, renderer } = await createRenderedVirtualize(50, 100, undefined, simpleItemTemplate);
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    const task = virtualize.scrollToItem(-5);
    await renderer.waitUntilIdle();

    await expect(task).resolves.toBeUndefined();
    // Clamped: the window lands at the start.
    expect(virtualize.itemsBefore).toBe(0);
  });

  it("an index beyond the count does not throw", async () => {
    // Blazor: ScrollToIndexAsync_IndexBeyondCountDoesNotThrow
    const { virtualize, renderer } = await createRenderedVirtualize(50, 100, undefined, simpleItemTemplate);
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    const task = virtualize.scrollToItem(99_999);
    await renderer.waitUntilIdle();

    await expect(task).resolves.toBeUndefined();
    // Clamped: the window lands at the end. The capacity is ceil(500 / 50) + 2 × 15 = 40, so the last full
    // window starts at max(0, 100 − 40) = 60.
    expect(virtualize.itemsBefore).toBe(60);
  });

  it("on an empty list it completes as a no-op", async () => {
    // Blazor: ScrollToIndexAsync_EmptyListCompletesAsNoOp
    // Regression (Blazor): the render rendezvous waited for a rendered row, which never comes for an empty list.
    const { virtualize } = await createRenderedVirtualize(50, 0);

    await expect(within(virtualize.scrollToItem(0), 2000)).resolves.toBeUndefined();
  });

  it("an already aborted signal rejects", async () => {
    // Blazor: ScrollToIndexAsync_AlreadyCancelledTokenProducesCancelledTask
    const { virtualize } = await createRenderedVirtualize(50, 100);
    const controller = new AbortController();
    controller.abort();

    await expect(virtualize.scrollToItem(10, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("aborting the signal aborts the provider request", async () => {
    // Blazor: ScrollToIndexAsync_CancellationCancelsProviderRequest (quarantined in Blazor, #68852)
    let blockProvider = false;
    const requestStarted = deferred();
    const requestCanceled = deferred();
    const provider: VirtualizeItemsProvider<number> = async (request) => {
      if (!blockProvider) {
        return { items: range(request.startIndex, Math.min(request.count, 100 - request.startIndex)), totalItemCount: 100 };
      }
      requestStarted.resolve();
      // Blazor's `Task.Delay(Timeout.InfiniteTimeSpan, token)`: pending until the signal aborts.
      return new Promise((_, reject) => {
        request.signal.addEventListener("abort", () => {
          requestCanceled.resolve();
          reject(request.signal.reason);
        });
      });
    };
    const { virtualize, renderer } = await createRenderedVirtualize(50, 100, provider);
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    blockProvider = true;
    const controller = new AbortController();
    const task = virtualize.scrollToItem(90, controller.signal);
    await within(requestStarted.promise, 2000);

    controller.abort();

    await expect(within(task, 2000)).rejects.toMatchObject({ name: "AbortError" });
    await within(requestCanceled.promise, 2000);
    await renderer.waitUntilIdle();
  });

  it("a second call does not fault the first", async () => {
    // Blazor: ScrollToIndexAsync_SecondCallDoesNotFaultFirstTask
    const m = await createRenderedVirtualize(50, 1000);
    const { virtualize, renderer } = m;
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();

    let secondSettled: "resolved" | "rejected" | undefined;
    const first = virtualize.scrollToItem(500);
    const second = virtualize.scrollToItem(750);
    second.then(
      () => (secondSettled = "resolved"),
      () => (secondSettled = "rejected"),
    );

    // The superseded call resolves (superseded is not cancelled).
    await expect(within(first, 2000)).resolves.toBeUndefined();
    // Without an item template no row renders, so the second call may still wait for its render (as in
    // Blazor): it must not have failed. It may stay pending, so the renderer is not waited on here.
    await flushMicrotasks();
    expect(secondSettled).not.toBe("rejected");

    // Disposing settles a call still waiting.
    m.host.remove();
    await within(second, 2000);
    await renderer.waitUntilIdle();
  });

  it("a throwing provider rejects instead of hanging", async () => {
    // Blazor: ScrollToIndexAsync_ProviderThrows_FaultsTaskInsteadOfHanging
    const sentinel = new Error("provider boom");
    const throwingProvider: VirtualizeItemsProvider<number> = () => {
      throw sentinel;
    };
    const m = await createRenderedVirtualize(50, 100, throwingProvider);

    const task = m.virtualize.scrollToItem(50);

    await expect(within(task, 2000)).rejects.toBe(sentinel);
    await m.renderer.waitUntilIdle();
    // The render throws it too, so an error boundary sees it (Blazor rethrows it from BuildRenderTree).
    expect(takeErrors(m).map((failure) => [failure.phase, failure.error])).toEqual([["render", sentinel]]);
  });

  it("a programmatic-scroll before-spacer report does not reset the window", async () => {
    // Blazor: OnBeforeSpacerVisible_ProgrammaticScroll_DoesNotResetWindow
    // dotnet/aspnetcore#68114, #68064: a transient top-spacer report during our own scroll must be ignored,
    // or it snaps the window back toward index 0 and the scroll target is lost.
    const { virtualize, renderer } = await createRenderedVirtualize(50, 1000);
    virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    virtualize.spacerBeforeVisible(5000, 500, 500, SpacerVisibilityReason.ViewportFill);
    await renderer.waitUntilIdle();
    const itemsBeforeAtTarget = virtualize.itemsBefore;
    expect(itemsBeforeAtTarget).toBeGreaterThan(0);

    virtualize.spacerBeforeVisible(0, 500, 500, SpacerVisibilityReason.ProgrammaticScroll);
    await renderer.waitUntilIdle();

    expect(virtualize.itemsBefore).toBe(itemsBeforeAtTarget);
  });
});

/* S. CSP and lifecycle ---------------------------------------------------- */

describe("S. CSP and lifecycle", () => {
  afterEach(() => {
    useCssomStyles(false);
    vi.restoreAllMocks();
  });

  it("the spacer heights reach the DOM through the CSSOM under strictCsp, without data attributes", async () => {
    // Blazor: Virtualize_SpacersUseDataAttributeNotInlineStyle
    // Tsazor: Blazor writes the heights as data-blazor-virtualize-reserved-height attributes that its JS mirrors
    // to the CSSOM, because a CSP without 'unsafe-inline' blocks style attributes. Tsazor's renderer writes
    // `style` through the CSSOM itself under strictCsp (spec §10.3), so the port checks that: the heights are
    // there, written through `style.cssText`, and no data attributes.
    useCssomStyles(true);
    const cssTextOwner = prototypeOwning(document.createElement("div").style, "cssText");
    const cssTextSet = vi.spyOn(cssTextOwner, "cssText", "set");

    const m = await renderVirtualize<number>({ ItemSize: 50, Items: range(1, 100), ChildContent: spanItemTemplate });

    const { before, after } = spacersOf(m.container);
    expect(before.style.height).toBe("0px");
    // Nothing rendered yet: the after spacer stands for all 100 items at the estimated 50px.
    expect(after.style.height).toBe("5000px");
    const written = cssTextSet.mock.calls.map(([text]) => text);
    expect(written).toContain("height: 0px; flex-shrink: 0;");
    expect(written).toContain("height: 5000px; flex-shrink: 0;");
    const dataAttributes = [before, after].flatMap((spacer) => spacer.getAttributeNames().filter((name) => name.startsWith("data-")));
    expect(dataAttributes).toEqual([]);
  });

  it("disposed while its first post-render step is pending, it touches nothing afterwards", async () => {
    // Blazor: Virtualize_DisposedWhileInitializationPending_DoesNotUseDisposedObjectReference
    // Tsazor: Blazor gates the asynchronous JS `init` and removes the component meanwhile. Tsazor's viewport
    // starts synchronously (spec §10.3); what stays pending after the first render is the InitialItemIndex
    // positioning, which waits for the render that shows its window. The component is removed at that moment:
    // when the positioning begins its programmatic scroll.
    const m = mountVirtualize<number>({
      Items: range(0, 500),
      ItemSize: 30,
      InitialItemIndex: 50,
      ChildContent: simpleItemTemplate,
    });
    let removed = false;
    onViewportCreated = (viewport) => {
      viewport.onCall = (method) => {
        if (method === "beginProgrammaticScroll" && !removed) {
          removed = true;
          m.host.remove();
        }
      };
    };

    await within(m.renderer.waitUntilIdle(), 2000);

    expect(removed).toBe(true);
    expect(m.container.children).toHaveLength(0);
    expect(m.viewport.disposed).toBe(true);
    expect(m.viewport.callsAfterDispose).toBe(0);
    // Reports the viewport might still deliver are ignored.
    m.virtualize.spacerAfterVisible(0, 500, 500, SpacerVisibilityReason.ViewportFill);
    await m.renderer.waitUntilIdle();
    expect(m.viewport.callsAfterDispose).toBe(0);
  });

  it("disposed while a later post-render step is pending, it touches nothing afterwards", async () => {
    // Blazor: Virtualize_DisposedWhileLaterRenderInteropPending_DoesNotUseDisposedObjectReference
    // Tsazor: Blazor gates the setAnchorMode call a later render makes; Tsazor's call is synchronous, so the
    // component is removed at the moment it makes that call.
    const m = await renderVirtualize<number>({
      Items: range(0, 500),
      ItemSize: 30,
      AnchorMode: VirtualizeAnchorMode.None,
      ChildContent: simpleItemTemplate,
    });
    let removed = false;
    m.viewport.onCall = (method) => {
      if (method === "setAnchorMode" && !removed) {
        removed = true;
        m.host.remove();
      }
    };

    m.host.update({ AnchorMode: VirtualizeAnchorMode.Start });
    await within(m.renderer.waitUntilIdle(), 2000);

    expect(removed).toBe(true);
    expect(m.container.children).toHaveLength(0);
    expect(m.viewport.disposed).toBe(true);
    expect(m.viewport.callsAfterDispose).toBe(0);
  });
});

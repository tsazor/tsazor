import { ComponentBase, isPromiseLike } from "./component-base.js";
import { Parameter } from "./parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";

/** How a promise settled, as an `<Await>` saw it. */
type Settlement = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: unknown };

/**
 * Settlements recorded per promise (weakly): an `<Await>` that meets a promise
 * another one (or an earlier parameter set) already saw settle renders the
 * result right away instead of one microtask of `Pending`.
 */
const settlements = new WeakMap<object, Settlement>();

/**
 * Tsazor extension (Svelte's `{#await}`; Blazor has no counterpart): renders
 * the state of a promise.
 *
 * ```razor
 * <Await For="@user">
 *     <Pending><p>Loading…</p></Pending>
 *     <Then Context="u">Hello @u.name</Then>
 *     <Catch Context="err">Failed: @err.message</Catch>
 * </Await>
 * ```
 *
 * - `Pending` renders while the promise is pending, `Then` with its value,
 *   `Catch` with the rejection reason. A missing fragment renders nothing.
 * - A value that is no promise counts as already resolved (`Then` renders
 *   it at once); `null`/`undefined` means "no promise yet" and renders
 *   `Pending`.
 * - A new promise identity starts over at `Pending`; a promise that settles
 *   after it was replaced is ignored (the latest one wins). The same
 *   promise on a re-render changes nothing. After the component is disposed,
 *   a settlement is ignored.
 * - A promise's state cannot be read synchronously: an already settled
 *   promise renders `Pending` for one microtask (the browser does not paint
 *   in between, so nothing flashes). A promise an `<Await>` already saw
 *   settle renders its result immediately.
 * - A rejection without `Catch` is not swallowed: it fails the component
 *   (phase `lifecycle`), so the nearest `ErrorBoundary` shows it.
 * - The current pending promise counts for `renderer.waitUntilIdle()`, like
 *   an async `onInitialized` (a replaced one stops counting).
 *
 * The parameters are write-only (setters): `then` as a readable function
 * would make an `Await` instance look like a thenable to `await` and
 * `Promise.resolve`.
 */
export class Await<TValue = unknown> extends ComponentBase {
  /**
   * The promise to wait for (`For="@user"`). A value that is no promise
   * counts as resolved; `null`/`undefined` renders `Pending`. Its resolved
   * type is the `Then` context's type.
   */
  @Parameter() set for(source: PromiseLike<TValue> | TValue | null | undefined) {
    this.#for = source;
  }

  /** Rendered while the promise is pending (`<Pending>`). */
  @Parameter() set pending(fragment: RenderFragment | undefined) {
    this.#pending = fragment;
  }

  /**
   * Rendered with the resolved value (`<Then Context="value">`). Write-only,
   * so the component is never a thenable.
   */
  @Parameter() set then(fragment: ((value: TValue) => RenderFragment) | undefined) {
    this.#then = fragment;
  }

  /**
   * Rendered with the rejection reason (`<Catch Context="error">`). The reason
   * is `unknown`, as in a TypeScript `catch` clause. Without it a rejection
   * fails the component (nearest ErrorBoundary).
   */
  @Parameter() set catch(fragment: ((error: unknown) => RenderFragment) | undefined) {
    this.#catch = fragment;
  }

  #for: unknown;
  #pending: RenderFragment | undefined;
  #then: ((value: TValue) => RenderFragment) | undefined;
  #catch: ((error: unknown) => RenderFragment) | undefined;
  /** The `for` value the current state belongs to. */
  #source: unknown;
  #tracking = false;
  #settlement: Settlement | null = null;
  /** Ends the current promise's waitUntilIdle tracking early (replaced or disposed). */
  #release: (() => void) | undefined;

  protected override onParametersSet(): void {
    const source = this.#for;
    if (this.#tracking && Object.is(source, this.#source)) return;
    this.#tracking = true;
    this.#source = source;
    this.#settlement = null;
    this.#release?.();
    this.#release = undefined;
    if (source === null || source === undefined) return;
    if (!isPromiseLike(source)) {
      this.#settlement = { ok: true, value: source };
      return;
    }
    const known = settlements.get(source);
    if (known !== undefined) {
      this.#settlement = known;
      // Known rejected and nothing renders it: fail the lifecycle (ErrorBoundary).
      if (!known.ok && this.#catch === undefined) throw known.error;
      return;
    }
    const signal = this.disposeSignal;
    const settle = (settlement: Settlement): void => {
      settlements.set(source, settlement);
      // Replaced by a newer promise, or the component is gone: ignored.
      if (signal.aborted || !Object.is(this.#source, source)) return;
      this.#settlement = settlement;
      if (!settlement.ok && this.#catch === undefined) {
        this.reportErrorInternal(settlement.error, "lifecycle");
        return;
      }
      this.stateHasChangedInternal();
    };
    const settled = Promise.resolve(source).then(
      (value) => settle({ ok: true, value }),
      (error: unknown) => settle({ ok: false, error }),
    );
    // waitUntilIdle waits for the current promise only: a replaced one, or
    // one whose component is gone, stops counting.
    const released = new Promise<void>((resolve) => {
      this.#release = resolve;
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
    this.renderHandle.track(Promise.race([settled, released]));
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    const settlement = this.#settlement;
    if (settlement === null) {
      if (this.#pending) b.addContent(0, this.#pending);
    } else if (settlement.ok) {
      if (this.#then) b.addContent(1, this.#then(settlement.value as TValue));
    } else if (this.#catch) {
      b.addContent(2, this.#catch(settlement.error));
    }
  }
}

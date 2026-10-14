import { componentInternals } from "./component-internals.js";
import { ComponentBase } from "./component-base.js";
import { Parameter } from "./parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import { isPromiseLike } from "./component-base.js";
import type { IErrorBoundary } from "./error-boundary-contract.js";

export { isIErrorBoundary, type IErrorBoundary } from "./error-boundary-contract.js";

/**
 * Blazor's ErrorBoundaryBase: renders ChildContent while healthy and switches
 * to ErrorContent once the renderer has routed a child failure here.
 *
 * Handled errors run through `onError` (Blazor's OnErrorAsync logging hook);
 * after `maximumErrorCount` errors between recoveries the error is rethrown
 * (fatal — the renderer routes it to its error handler, Blazor to
 * HandleException).
 */
export abstract class ErrorBoundaryBase extends ComponentBase implements IErrorBoundary {
  /** The content rendered while there is no error. */
  @Parameter() childContent?: RenderFragment;

  /**
   * The content rendered with the handled error. Deviation from Blazor's
   * `RenderFragment<Exception?>`: exceptions are `unknown` in TypeScript.
   */
  @Parameter() errorContent?: (error: unknown) => RenderFragment;

  /**
   * The maximum number of errors handled between two recoveries; further
   * errors are fatal (Blazor's default).
   */
  @Parameter() maximumErrorCount: number = 100;

  readonly isErrorBoundary = true as const;

  /** The handled error while in the error state (Blazor's CurrentException). */
  protected currentException: unknown = null;

  private errorCount = 0;

  /** Blazor's IErrorBoundary.HandleException. Throws (fatal) over the limit. */
  handleException(error: unknown): void {
    if (++this.errorCount > this.maximumErrorCount) {
      // Over the maximum between recoveries: rethrow, as in Blazor's
      // HandleException (its caller makes it fatal). The current error is not
      // adopted; the boundary keeps its previous state.
      throw error;
    }
    const logged = this.onError(error);
    if (isPromiseLike(logged)) {
      // Tracked for waitUntilIdle. Deviation: Blazor routes a faulting
      // OnErrorAsync back through the render pipeline (fatal); ours surfaces
      // as an unhandled rejection.
      componentInternals.renderHandle(this)!.track(logged);
    }
    this.currentException = error;
    componentInternals.requestRender(this);
  }

  /**
   * Blazor's Recover: resets the count and leaves the error state. No effect
   * while there is no error.
   */
  recover(): void {
    if (this.currentException !== null) {
      this.errorCount = 0;
      this.currentException = null;
      componentInternals.requestRender(this);
    }
  }

  /**
   * Blazor's OnErrorAsync, invoked per handled error before the error state
   * renders. Deviation: Blazor logs via the injected IErrorBoundaryLogger;
   * Tsazor has no logger service, so the default logs to the console.
   */
  protected onError(error: unknown): void | Promise<void> {
    // eslint-disable-next-line no-console
    console.error("[tsazor] ErrorBoundary handled:", error);
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (this.currentException === null) {
      if (this.childContent) b.addContent(0, this.childContent);
    } else if (this.errorContent) {
      b.addContent(0, this.errorContent(this.currentException));
    } else {
      b.openElement(0, "div");
      b.addAttribute(1, "class", "blazor-error-boundary");
      b.closeElement();
    }
  }
}

/**
 * Blazor's ErrorBoundary (Microsoft.AspNetCore.Components.Web): the concrete
 * boundary, `<ErrorBoundary>` in markup.
 */
export class ErrorBoundary extends ErrorBoundaryBase {}
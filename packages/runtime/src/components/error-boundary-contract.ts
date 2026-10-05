/**
 * The error-boundary protocol on its own: the renderer checks for it on
 * every failure, and importing it must not pull in the ErrorBoundary
 * components (bundle size).
 */
import type { ComponentBase } from "./component-base.js";

/**
 * Blazor's IErrorBoundary: the marker protocol the renderer routes failures
 * to (see Renderer.handleComponentError). Any component may implement it;
 * `ErrorBoundaryBase` is the port of Blazor's abstract base.
 */
export interface IErrorBoundary {
  /** Protocol marker, set by ErrorBoundaryBase (and by hand if desired). */
  readonly isErrorBoundary: true;
  /** Blazor's IErrorBoundary.HandleException, called by the renderer. */
  handleException(error: unknown): void;
}

/** Structural check (Blazor's `component is IErrorBoundary`). */
export function isIErrorBoundary(component: unknown): component is ComponentBase & IErrorBoundary {
  return (component as Partial<IErrorBoundary>).isErrorBoundary === true &&
    typeof (component as Partial<IErrorBoundary>).handleException === "function";
}

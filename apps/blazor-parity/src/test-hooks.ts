import { Virtualize } from "@tsazor/runtime";

/**
 * What the ported tests reach inside the page. Blazor's tests patch globals of Blazor's JS runtime, for
 * example `DotNet.DotNetObject.prototype.invokeMethodAsync` to record the spacer callbacks from JS to .NET.
 * Tsazor's viewport calls the component directly, so a test patches the component class through this hook.
 */
export interface BlazorParityHooks {
  readonly Virtualize: typeof Virtualize;
}

declare global {
  interface Window {
    blazorParity: BlazorParityHooks;
  }
}

export function exposeTestHooks(): void {
  window.blazorParity = { Virtualize };
}

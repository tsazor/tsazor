/**
 * `@tsazor/runtime/internal`: the renderer's machinery and ComponentBase's plumbing, for Tsazor's own packages
 * (@tsazor/testing) and the repository's tests. Not covered by the stability promise (docs/support-policy.md, D-S7):
 * it changes with any release, in lockstep with the packages that use it. Apps use `@tsazor/runtime`.
 */

// ComponentBase's plumbing (functions over its private state)
export { componentInternals, type ComponentInternals } from "./components/component-internals.js";

// The renderer
export { Renderer, type RenderBatch, type RenderError, type RenderErrorHandler, type RenderErrorPhase } from "./renderer/renderer.js";
export { ComponentState, type CascadeEntry } from "./renderer/component-state.js";
export { DomRenderer } from "./renderer/dom-renderer.js";
export { Dispatcher } from "./renderer/dispatcher.js";
export type { RenderHandle } from "./renderer/render-handle.js";
export { computeDiff, RenderTreeEditType, type RenderTreeEdit, type RenderTreeDiff, type DiffOptions } from "./render-tree/diff.js";

// Components' helpers
export { toComponentDefinition, isComponentDefinition } from "./components/component-definition.js";
export { isIErrorBoundary, type IErrorBoundary } from "./components/error-boundary.js";
export { SectionRegistry, resolveSectionIdentifier, type SectionContentLike, type SectionOutletLike } from "./sections/section-registry.js";
export { SectionOutletContentRenderer } from "./sections/section-outlet.js";
export { headSectionId, titleSectionId } from "./head/head-content.js";
export { focusBySelector } from "./navigation/dom-wrapper.js";

// Routing's helpers
export { getRouteTable, isLazyRoute, matchRoute, parseRouteTemplate, RouteTable } from "./routing/route-data.js";
export { queryParametersOf } from "./routing/supply-parameter-from-query.js";

// Forms' and auth's helpers
export { validationRulesOf } from "./forms/validation-attributes.js";
export { standardSchemaField } from "./forms/standard-schema-validator.js";
export { watchAuthenticationState, type AuthenticationStateSubscribeOptions } from "./auth/authentication-state-provider.js";

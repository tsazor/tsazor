// Render tree
export { RenderTreeBuilder, type RenderTreeFrame, type RenderFragment, type AttributeValue } from "./render-tree/render-tree.js";
export { FrameType, EventHandlerFlags } from "./render-tree/frame-type.js";
export { computeDiff, RenderTreeEditType, type RenderTreeEdit, type RenderTreeDiff, type DiffOptions } from "./render-tree/diff.js";

// Components
export { ComponentBase } from "./components/component-base.js";
export { ParameterView } from "./components/parameter-view.js";
export { Parameter, CascadingParameter, type ParameterMeta } from "./components/parameter-metadata.js";
export { EventCallback } from "./components/event-callback.js";
export { defineComponent, toComponentDefinition, isComponentDefinition, type ComponentDefinition, type ComponentType } from "./components/component-definition.js";
export { CascadingValue } from "./components/cascading-value.js";

// Renderer
export { Renderer, type RenderBatch, type RenderError, type RenderErrorHandler, type RenderErrorPhase } from "./renderer/renderer.js";
export { ComponentState, type CascadeEntry } from "./renderer/component-state.js";
export { DomRenderer } from "./renderer/dom-renderer.js";
export { Dispatcher } from "./renderer/dispatcher.js";
export type { RenderHandle } from "./renderer/render-handle.js";
export { isCascadingValueSupplier, type CascadingValueSupplier } from "./renderer/cascading-value.js";

// DI
export { ServiceCollection, ServiceProvider, type Token } from "./di/service-collection.js";
export { inject } from "./di/service-provider.js";

// Navigation
export { NavigationManager } from "./navigation/navigation-manager.js";

// Routing
export {
  getRouteTable,
  matchRoute,
  parseRouteTemplate,
  RouteManifest,
  RouteTable,
  type RouteData,
  type RouteEntry,
  type RouteValue,
} from "./routing/route-data.js";
export { LayoutComponentBase } from "./routing/layout-component-base.js";
export { Router } from "./routing/router.js";
export { RouteView } from "./routing/route-view.js";
export { LayoutView } from "./routing/layout-view.js";
export { NavLink, NavLinkMatch } from "./routing/nav-link.js";
export { PageTitle } from "./routing/page-title.js";

// Data
export {
  Virtualize,
  type VirtualizeItemsProvider,
  type VirtualizeItemsProviderRequest,
  type VirtualizeItemsProviderResult,
} from "./data/virtualize.js";
export { TsazorHttp, type TsazorHttpOptions, type RequestInterceptor, type ResponseInterceptor } from "./data/tsazor-http.js";

// Forms
export { EditContext, type FieldIdentifier } from "./forms/edit-context.js";
export { InputBase } from "./forms/input-base.js";
export { InputText, InputTextArea, InputNumber, InputCheckbox, InputDate, InputSelect } from "./forms/input-text.js";
export { EditForm, type ModelValidator } from "./forms/edit-form.js";
export { ValidationMessage, ValidationSummary } from "./forms/validation.js";

// Auth (Blazor's Microsoft.AspNetCore.Components.Authorization analogue)
export { ANONYMOUS, AuthenticationState, anonymousUser, createUser, type ClaimsPrincipal, type Claim } from "./auth/authentication-state.js";
export { AuthenticationStateProvider, watchAuthenticationState } from "./auth/authentication-state-provider.js";
export { AuthorizationService, defaultAuthorizationService, type AuthorizationPolicy, type AuthorizationRequirements } from "./auth/authorization.js";
export { AuthorizeView } from "./auth/authorize-view.js";
export { CascadingAuthenticationState } from "./auth/cascading-authentication-state.js";
export { AuthorizeRouteView } from "./auth/authorize-route-view.js";

// App bootstrap
export { createTsazorApp, type TsazorAppOptions } from "./app.js";
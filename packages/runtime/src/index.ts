// Render tree
export { RenderTreeBuilder, type RenderTreeFrame, type RenderFragment, type AttributeValue } from "./render-tree/render-tree";
export { FrameType, EventHandlerFlags } from "./render-tree/frame-type";
export { matchChildren, type FrameMatch } from "./render-tree/diff";

// Components
export { ComponentBase } from "./components/component-base";
export { ParameterView } from "./components/parameter-view";
export { Parameter, CascadingParameter, type ParameterMeta } from "./components/parameter-metadata";
export { EventCallback } from "./components/event-callback";
export { defineComponent, toComponentDefinition, isComponentDefinition, type ComponentDefinition } from "./components/component-definition";
export { CascadingValue } from "./components/cascading-value";

// Renderer
export { Renderer } from "./renderer/renderer";
export { ComponentState, type CascadeEntry } from "./renderer/component-state";
export { DomRenderer } from "./renderer/dom-renderer";
export { Dispatcher } from "./renderer/dispatcher";
export type { RenderHandle } from "./renderer/render-handle";
export { isCascadingValueSupplier, type CascadingValueSupplier } from "./renderer/cascading-value";

// DI
export { ServiceCollection, ServiceProvider, type Token } from "./di/service-collection";
export { inject } from "./di/service-provider";

// Navigation
export { NavigationManager } from "./navigation/navigation-manager";

// Routing
export {
  matchRoute,
  parseRouteTemplate,
  RouteManifest,
  type RouteData,
  type RouteEntry,
} from "./routing/route-data";
export { LayoutComponentBase } from "./routing/layout-component-base";
export { Router } from "./routing/router";
export { RouteView } from "./routing/route-view";
export { LayoutView } from "./routing/layout-view";
export { NavLink, NavLinkMatch } from "./routing/nav-link";
export { PageTitle } from "./routing/page-title";

// Data
export {
  Virtualize,
  type VirtualizeItemsProvider,
  type VirtualizeItemsProviderRequest,
  type VirtualizeItemsProviderResult,
} from "./data/virtualize";
export { TasorHttp, type TasorHttpOptions, type RequestInterceptor, type ResponseInterceptor } from "./data/tasor-http";

// Forms
export { EditContext, type FieldIdentifier } from "./forms/edit-context";
export { InputBase } from "./forms/input-base";
export { InputText, InputTextArea, InputNumber, InputCheckbox, InputDate, InputSelect } from "./forms/input-text";
export { EditForm, type ModelValidator } from "./forms/edit-form";
export { ValidationMessage, ValidationSummary } from "./forms/validation";

// Auth (Blazor's Microsoft.AspNetCore.Components.Authorization analogue)
export { ANONYMOUS, AuthenticationState, anonymousUser, createUser, type ClaimsPrincipal, type Claim } from "./auth/authentication-state";
export { AuthenticationStateProvider, watchAuthenticationState } from "./auth/authentication-state-provider";
export { AuthorizationService, defaultAuthorizationService, type AuthorizationPolicy, type AuthorizationRequirements } from "./auth/authorization";
export { AuthorizeView } from "./auth/authorize-view";
export { CascadingAuthenticationState } from "./auth/cascading-authentication-state";
export { AuthorizeRouteView } from "./auth/authorize-route-view";

// App bootstrap
export { createTasorApp, type TasorAppOptions } from "./app";
// Render tree
export { RenderTreeBuilder, type RenderTreeFrame, type RenderFragment, type AttributeValue } from "./render-tree/render-tree.js";
export { FrameType, EventHandlerFlags } from "./render-tree/frame-type.js";
export { computeDiff, RenderTreeEditType, type RenderTreeEdit, type RenderTreeDiff, type DiffOptions } from "./render-tree/diff.js";

// Components
export { ComponentBase } from "./components/component-base.js";
export { ParameterView } from "./components/parameter-view.js";
export { Parameter, CascadingParameter, defineParameter, type ParameterMeta } from "./components/parameter-metadata.js";
export { Bindable, type BindableOptions } from "./components/bindable.js";
export { State } from "./components/state.js";
export type { ObserveSource, ObserveListener, ObserveTeardown, Subscribable } from "./components/observe.js";
export { EventCallback } from "./components/event-callback.js";
export { bindMethod } from "./components/bind-method.js";
export { addAttachment, type Attachment } from "./components/attachment.js";
export {
  addAnimate,
  addTransition,
  configureTransitions,
  type Animate,
  type Transition,
  type TransitionConfig,
  type TransitionOptions,
  type TransitionSettings,
} from "./components/motion.js";
export { defineComponent, toComponentDefinition, isComponentDefinition, type ComponentDefinition, type ComponentType } from "./components/component-definition.js";
export { CascadingValue } from "./components/cascading-value.js";
export { DynamicComponent } from "./components/dynamic-component.js";
export { MarkupString } from "./components/markup-string.js";
export { ErrorBoundaryBase, ErrorBoundary, isIErrorBoundary, type IErrorBoundary } from "./components/error-boundary.js";
export { Await } from "./components/await.js";
export { SectionRegistry, resolveSectionIdentifier, type SectionContentLike, type SectionOutletLike } from "./sections/section-registry.js";
export { SectionOutlet, SectionOutletContentRenderer } from "./sections/section-outlet.js";
export { SectionContent } from "./sections/section-content.js";
export { HeadContent, headSectionId, titleSectionId } from "./head/head-content.js";
export { HeadOutlet } from "./head/head-outlet.js";
export { focusBySelector } from "./navigation/dom-wrapper.js";

// Renderer
export { Renderer, type RenderBatch, type RenderError, type RenderErrorHandler, type RenderErrorPhase } from "./renderer/renderer.js";
export { ComponentState, type CascadeEntry } from "./renderer/component-state.js";
export { DomRenderer } from "./renderer/dom-renderer.js";
export { Dispatcher } from "./renderer/dispatcher.js";
export type { RenderHandle } from "./renderer/render-handle.js";
export { isCascadingValueSupplier, type CascadingValueSupplier } from "./renderer/cascading-value.js";

// DI
export { ServiceCollection, ServiceProvider, type ServiceLifetime, type Token } from "./di/service-collection.js";
export { inject } from "./di/service-provider.js";

// Localization (E8): CultureInfo over Intl, the app-wide CultureService, the
// IStringLocalizer counterpart (docs/design-localization.md).
export { CultureInfo } from "./localization/culture-info.js";
export { CultureService, type CultureChangedEventArgs } from "./localization/culture-service.js";
export { StringLocalizer, formatMessage, type StringTable, type StringTableSource, type StringLocalizerOptions, type PlaceholdersOf } from "./localization/string-localizer.js";

// Navigation
export {
  NavigationManager,
  type LocationChangedEventArgs,
  type LocationChangingContext,
  type LocationChangingHandler,
  type NavigationOptions,
  type NavigationManagerOptions,
  type RoutingMode,
} from "./navigation/navigation-manager.js";
export { MemoryHistory } from "./navigation/memory-history.js";

// Routing
export {
  getRouteTable,
  isLazyRoute,
  matchRoute,
  parseRouteTemplate,
  RouteManifest,
  RouteTable,
  type LazyRouteEntry,
  type LoadedRoute,
  type RouteData,
  type RouteEntry,
  type RouteManifestEntry,
  type RouteMatch,
  type RouteValue,
} from "./routing/route-data.js";
export { LayoutComponentBase } from "./routing/layout-component-base.js";
export { Router, type NavigationContext } from "./routing/router.js";
export { RouteView } from "./routing/route-view.js";
export { LayoutView } from "./routing/layout-view.js";
export { SupplyParameterFromQuery, queryParametersOf, type QueryParameterType, type QueryParameterMeta } from "./routing/supply-parameter-from-query.js";
export { NavLink, NavLinkMatch } from "./routing/nav-link.js";
export { PageTitle } from "./routing/page-title.js";
export { FocusOnNavigate } from "./routing/focus-on-navigate.js";
export { NavigationLock } from "./routing/navigation-lock.js";

// Data
export {
  Virtualize,
  type VirtualizeItemsProvider,
  type VirtualizeItemsProviderRequest,
  type VirtualizeItemsProviderResult,
} from "./data/virtualize.js";
export { TsazorHttp, TsazorHttpError, type TsazorHttpOptions, type RequestInterceptor, type ResponseInterceptor } from "./data/tsazor-http.js";

// Forms
export { EditContext, ValidationMessageStore, type FieldIdentifier, type DataAnnotationsValidationSubscription } from "./forms/edit-context.js";
export type { ModelValidator } from "./forms/edit-form.js";
export { InputBase } from "./forms/input-base.js";
export { InputText, InputTextArea, InputNumber, InputCheckbox, InputDate, InputSelect } from "./forms/input-text.js";
export { EditForm } from "./forms/edit-form.js";
export { ValidationMessage, ValidationSummary } from "./forms/validation.js";
export { DataAnnotationsValidator } from "./forms/data-annotations-validator.js";
export { enableDataAnnotationsValidation } from "./forms/edit-context.js";
export { InputFile, InputFileChangeEventArgs } from "./forms/input-file.js";
export { formatValue, parseValue } from "./forms/bind-format.js";
export {
  Required,
  MinLength,
  MaxLength,
  StringLength,
  Range,
  EmailAddress,
  RegularExpression,
  Compare,
  type ValidationRule,
  validationRulesOf,
} from "./forms/validation-attributes.js";

// Auth (Blazor's Microsoft.AspNetCore.Components.Authorization analogue)
export { ANONYMOUS, AuthenticationState, anonymousUser, createUser, type ClaimsPrincipal, type Claim } from "./auth/authentication-state.js";
export { AuthenticationStateProvider, watchAuthenticationState } from "./auth/authentication-state-provider.js";
export { AuthorizationService, defaultAuthorizationService, type AuthorizationPolicy, type AuthorizationRequirements } from "./auth/authorization.js";
export { AuthorizeView } from "./auth/authorize-view.js";
export { CascadingAuthenticationState } from "./auth/cascading-authentication-state.js";
export { AuthorizeRouteView } from "./auth/authorize-route-view.js";

// App bootstrap
export { createTsazorApp, type TsazorAppOptions, type RoutingOptions, type LocalizationOptions } from "./app.js";
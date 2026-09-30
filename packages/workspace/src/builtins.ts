/**
 * Runtime built-ins: components and types exported by @tsazor/runtime. Markup
 * tags resolve against this list (Blazor: _Imports with
 * Microsoft.AspNetCore.Components.Web); @inject/@inherits types resolve against
 * RUNTIME_TYPES. Free names in markup/@code are never imported from here —
 * they need an explicit @import (usually the standard set in _Imports.tsazor).
 */
export const RUNTIME_PACKAGE = "@tsazor/runtime";

/** Component classes usable as markup tags. */
export const RUNTIME_COMPONENTS: ReadonlySet<string> = new Set([
  "Router",
  "RouteView",
  "AuthorizeRouteView",
  "NavLink",
  "LayoutView",
  "PageTitle",
  "NavigationLock",
  "CascadingValue",
  "AuthorizeView",
  "CascadingAuthenticationState",
  "Virtualize",
  "EditForm",
  "InputText",
  "InputTextArea",
  "InputNumber",
  "InputCheckbox",
  "InputDate",
  "InputSelect",
  "ValidationMessage",
  "ValidationSummary",
]);

/**
 * Parameters of the built-in runtime components (attribute completions in the
 * language server). Hand-maintained — mirrors the @Parameter() declarations in
 * packages/runtime/src (input components inherit InputBase's Value/ValueChanged/
 * ValueExpression/additionalAttributes).
 */
const INPUT_PARAMS: ReadonlyArray<{ name: string; doc?: string }> = [
  { name: "Value", doc: "Two-way bound value (@bind-Value)." },
  { name: "ValueChanged", doc: "Change callback (@bind-Value binds this automatically)." },
  { name: "ValueExpression", doc: "Field expression for validation." },
  { name: "additionalAttributes", doc: "Attribute splat (captureUnmatchedValues)." },
];

export const RUNTIME_COMPONENT_PARAMS: Readonly<Record<string, ReadonlyArray<{ name: string; doc?: string }>>> = {
  Router: [
    { name: "routes", doc: "Route entries (from the generated routes module)." },
    { name: "found", doc: "RenderFragment receiving the matched RouteData." },
    { name: "notFound", doc: "RenderFragment when no route matches." },
  ],
  RouteView: [
    { name: "routeData", doc: "RouteData supplied by the Router." },
    { name: "defaultLayout", doc: "Layout for pages without an @layout directive." },
  ],
  AuthorizeRouteView: [
    { name: "routeData", doc: "RouteData supplied by the Router." },
    { name: "defaultLayout", doc: "Layout for pages without an @layout directive." },
    { name: "authorized", doc: "Content when authorization succeeds." },
    { name: "notAuthorized", doc: "Content when authorization fails." },
    { name: "authorizing", doc: "Content while authorization is in-flight." },
  ],
  NavLink: [
    { name: "href", doc: "Target href, base-relative (\"/counter\")." },
    { name: "match", doc: "NavLinkMatch.Prefix (default) or NavLinkMatch.All." },
    { name: "activeClass", doc: "Class added while active (default \"active\")." },
    { name: "cssClass", doc: "Static classes always present on the anchor." },
    { name: "childContent", doc: "Link content." },
  ],
  LayoutView: [
    { name: "layout", doc: "Layout component to render the content inside." },
    { name: "childContent", doc: "Content to project into the layout's Body." },
  ],
  PageTitle: [{ name: "childContent", doc: "The title text." }],
  NavigationLock: [
    { name: "onBeforeInternalNavigation", doc: "Runs before internal navigations; may call context.preventNavigation()." },
    { name: "confirmExternalNavigation", doc: "Ask the browser to confirm leaving the app (beforeunload)." },
  ],
  CascadingValue: [
    { name: "value", doc: "The value to cascade." },
    { name: "name", doc: "Optional name for @bind:by-name style cascading." },
    { name: "childContent", doc: "Children that can consume the value." },
    { name: "additionalAttributes", doc: "Attribute splat (captureUnmatchedValues)." },
  ],
  AuthorizeView: [
    { name: "policy", doc: "Named policy or policy function." },
    { name: "roles", doc: "Comma-separated roles or role array." },
    { name: "childContent", doc: "Content when authorized." },
    { name: "authorized", doc: "RenderFragment(state) when authorized." },
    { name: "notAuthorized", doc: "Content when authorization fails." },
    { name: "authorizing", doc: "Content while authorization is in-flight." },
  ],
  CascadingAuthenticationState: [{ name: "childContent", doc: "App content under authentication cascading." }],
  Virtualize: [
    { name: "items", doc: "In-memory items to virtualize." },
    { name: "itemsProvider", doc: "Async provider for paged data." },
    { name: "itemSize", doc: "Estimated item height in px (default 50)." },
    { name: "overscan", doc: "Extra items rendered above/below (default 3)." },
    { name: "itemTemplate", doc: "RenderFragment factory per item." },
    { name: "additionalAttributes", doc: "Attribute splat (captureUnmatchedValues)." },
  ],
  EditForm: [
    { name: "model", doc: "The form's model object." },
    { name: "validators", doc: "Named ModelValidators." },
    { name: "onValidSubmit", doc: "Handler invoked after validation passes." },
    { name: "childContent", doc: "Form fields." },
    { name: "additionalAttributes", doc: "Attribute splat (captureUnmatchedValues)." },
  ],
  InputText: INPUT_PARAMS,
  InputTextArea: INPUT_PARAMS,
  InputNumber: INPUT_PARAMS,
  InputCheckbox: INPUT_PARAMS,
  InputDate: INPUT_PARAMS,
  InputSelect: INPUT_PARAMS,
  ValidationMessage: [
    { name: "For", doc: "Field name the message belongs to." },
    { name: "additionalAttributes", doc: "Attribute splat (captureUnmatchedValues)." },
  ],
  ValidationSummary: [
    { name: "additionalAttributes", doc: "Attribute splat (captureUnmatchedValues)." },
  ],
};

/** Runtime types an @inject/@inherits may name without an @import (compiler-generated import). */
export const RUNTIME_TYPES: ReadonlySet<string> = new Set([
  "ComponentBase",
  "LayoutComponentBase",
  "RenderTreeBuilder",
  "RenderFragment",
  "RenderTreeFrame",
  "FrameType",
  "EventHandlerFlags",
  "EventCallback",
  "ParameterView",
  "Parameter",
  "CascadingParameter",
  "NavigationManager",
  "Router",
  "RouteView",
  "NavLink",
  "NavLinkMatch",
  "LayoutView",
  "PageTitle",
  "NavigationLock",
  "AuthorizeRouteView",
  "AuthorizeView",
  "CascadingAuthenticationState",
  "CascadingValue",
  "AuthenticationState",
  "AuthenticationStateProvider",
  "AuthorizationService",
  "ClaimsPrincipal",
  "createUser",
  "RouteData",
  "RouteEntry",
  "RouteManifest",
  "matchRoute",
  "parseRouteTemplate",
  "EditContext",
  "InputBase",
  "InputText",
  "InputTextArea",
  "InputNumber",
  "InputCheckbox",
  "InputDate",
  "InputSelect",
  "EditForm",
  "ModelValidator",
  "ValidationMessage",
  "ValidationSummary",
  "Virtualize",
  "VirtualizeItemsProvider",
  "VirtualizeItemsProviderRequest",
  "VirtualizeItemsProviderResult",
  "TsazorHttp",
  "ServiceCollection",
  "ServiceProvider",
  "Token",
  "Renderer",
  "createTsazorApp",
]);
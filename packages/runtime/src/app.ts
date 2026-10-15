import { Renderer } from "./renderer/renderer.js";
import { NavigationManager, type RoutingMode } from "./navigation/navigation-manager.js";
import { ServiceCollection, ServiceProvider, type Token } from "./di/service-collection.js";
import type { ComponentBase } from "./components/component-base.js";
import type { ComponentDefinition } from "./components/component-definition.js";
import { RouteManifest, type RouteManifestEntry } from "./routing/route-data.js";
import { whenHeadOutlet } from "./head/head-support.js";
import type { StringTable, StringTableSource } from "./localization/string-localizer.js";
import { LocalizationSettings } from "./di/service-defaults.js";
import { useCssomStyles } from "./renderer/dom-attributes.js";

/**
 * Blazor's WebAssemblyHostBuilder equivalent: wires renderer, DI and
 * navigation and mounts the root component.
 */
export interface TsazorAppOptions {
  /** Root component (a definition or a component class). */
  root: ComponentDefinition | (abstract new () => ComponentBase);
  /** DI registrations (Blazor's ConfigureServices analogue). */
  services?: (services: ServiceCollection) => void;
  /** Route manifest (from `virtual:tsazor-routes`, eager and lazy entries); Router falls back to it. */
  routes?: readonly RouteManifestEntry[];
  /** DOM selector for the app root (default: #app). */
  selector?: string;
  /** Shared NavigationManager; a fresh one is created when omitted. */
  navigationManager?: NavigationManager;
  /**
   * Routing options for the app's NavigationManager. `mode: "hash"` (Tsazor
   * extension) keeps the route in the URL fragment (`#/orders/5`) for hosting
   * without an index.html fallback; the default is Blazor's history routing.
   * With a shared `navigationManager`, configure the mode there instead.
   * `holdPreviousPage` (Tsazor extension): how long an in-app navigation keeps
   * the previous page on screen while the new one loads.
   */
  routing?: RoutingOptions;
  /**
   * Localization options (E8): the app's default culture and its translation
   * tables. `CultureService` and `StringLocalizer` are always registered (an
   * unconfigured app gets an invariant culture and an empty localizer, whose
   * `get` returns the key); a `services` registration can replace either.
   */
  localization?: LocalizationOptions;
  /**
   * E1: the app runs under a strict Content Security Policy — `style-src`
   * without 'unsafe-inline', which blocks `setAttribute("style", …)`. Style
   * attributes are then written through the CSSOM (`style.cssText`); the
   * browser normalizes their text. Default false: the text stays as written.
   * (MarkupString needs no option: under Trusted Types it goes through the
   * runtime's `tsazor` policy.) See docs/csp.md.
   */
  strictCsp?: boolean;
}

/** App-level routing options (`createTsazorApp({ routing })`). */
export interface RoutingOptions {
  /** "history" (default, Blazor) or "hash" (Tsazor extension). */
  readonly mode?: RoutingMode;
  /**
   * Tsazor extension: an in-app navigation keeps the previous page on screen
   * until the new one has rendered and its async work is done — lifecycle
   * methods, the Router's OnNavigateAsync — at most this many ms (default
   * 1000), then shows it in one step, as Blazor's enhanced navigation does.
   * Without it, every render shows at once, as in Blazor's interactive render
   * modes: a page whose data is still loading shows empty for a few frames.
   * Needs view transitions in the browser (without them: `false`); `false`
   * turns it off.
   */
  readonly holdPreviousPage?: number | false;
}

/** App-level localization options (`createTsazorApp({ localization })`). */
export interface LocalizationOptions {
  /** The default culture (Blazor's ConfigureServices AddLocalization analogue); without it the app is invariant. */
  readonly defaultCulture?: string;
  /** Culture → table (a record, or an async loader — `import()` works). */
  readonly tables?: Readonly<Record<string, StringTableSource>>;
}

/** A running app (`createTsazorApp`'s result): its root services, its NavigationManager, and the way to stop it. */
export interface TsazorApp {
  /** The root service provider (`options.services`' registrations and the built-in ones). */
  readonly services: ServiceProvider;
  /** The app's NavigationManager. */
  readonly navigationManager: NavigationManager;
  /** Removes the app: its components, its DOM and its global listeners. */
  dispose(): void;
}

/** Each app's renderer, for Tsazor's tests (`rendererOf` in @tsazor/runtime/internal). */
const renderers = new WeakMap<TsazorApp, Renderer>();

/** The renderer behind an app (@tsazor/runtime/internal: tests wait for it, the SSR spike reads it). */
export function rendererOf(app: TsazorApp): Renderer {
  const renderer = renderers.get(app);
  if (renderer === undefined) throw new Error("rendererOf: not an app createTsazorApp returned.");
  return renderer;
}

/**
 * Starts a Tsazor app (Blazor's `WebAssemblyHostBuilder` + `RunAsync`): builds
 * the service provider (NavigationManager, CultureService, StringLocalizer and
 * the route manifest, then `options.services`), renders `HeadOutlet` into
 * `document.head` and the root component into the `selector` element.
 * Throws when the root element is missing or `routing.mode` conflicts with a
 * shared `navigationManager`.
 */
export function createTsazorApp(options: TsazorAppOptions): TsazorApp {
  const collection = new ServiceCollection();
  // An app-created NavigationManager is owned (and disposed) by the app; a
  // shared one passed in stays with its owner.
  useCssomStyles(options.strictCsp === true);
  const requestedMode = options.routing?.mode;
  if (options.navigationManager && requestedMode !== undefined && requestedMode !== options.navigationManager.routingMode) {
    throw new Error(
      `createTsazorApp: routing.mode '${requestedMode}' conflicts with the shared NavigationManager's mode '${options.navigationManager.routingMode}'. Configure the mode on the NavigationManager.`,
    );
  }
  const ownedNavigation = options.navigationManager ? null : new NavigationManager({ mode: requestedMode ?? "history" });
  collection.registerValue(NavigationManager as unknown as Token<NavigationManager>, options.navigationManager ?? ownedNavigation!);
  if (options.routes) {
    collection.registerValue(RouteManifest as unknown as Token<RouteManifest>, new RouteManifest(options.routes));
  }
  // E8: CultureService and StringLocalizer always exist (an unconfigured app is invariant with an
  // empty localizer whose `get` returns the key). Their modules register them as service defaults
  // (di/service-defaults.ts), so an app that never uses them does not bundle them; the settings
  // reach them here. The app's `services` callback may still replace either.
  if (options.localization) {
    collection.registerValue(
      LocalizationSettings as unknown as Token<LocalizationSettings>,
      new LocalizationSettings(options.localization.defaultCulture ?? "", options.localization.tables as Record<string, StringTableSource> | undefined),
    );
  }
  options.services?.(collection);
  const services = collection.build();

  const container = document.querySelector(options?.selector ?? "#app");
  if (!container) {
    throw new Error(`Tsazor app root element not found (selector: '${options?.selector ?? "#app"}').`);
  }

  const renderer = new Renderer(services);
  const holdPreviousPage = options.routing?.holdPreviousPage ?? 1000;
  if (holdPreviousPage !== false && !(holdPreviousPage > 0)) {
    throw new Error(`createTsazorApp: routing.holdPreviousPage must be a positive number of ms or false, not ${String(holdPreviousPage)}.`);
  }
  const releaseHold = holdPreviousPage === false ? undefined : services.get(NavigationManager as unknown as Token<NavigationManager>).addNavigationHold(renderer, holdPreviousPage);
  // Blazor's WebAssembly host renders <HeadOutlet> as a second root component
  // in the document's <head>: HeadContent/PageTitle content lands there. It is
  // mounted once PageTitle or HeadContent is part of the app (head-support.ts),
  // tracked and disposed with the app.
  let headState: ReturnType<Renderer["renderInContainer"]> | undefined;
  const stopWaitingForHead = whenHeadOutlet((outlet) => {
    headState = renderer.renderInContainer(outlet as Parameters<Renderer["renderInContainer"]>[0], document.head);
  });
  const state = renderer.renderInContainer(options.root, container);

  // HMR bridge: compiled .tsazor modules call this on import.meta.hot.accept.
  const globals = globalThis as unknown as { __tsazor?: { hmrSwap(oldType: unknown, newType: unknown): void } };
  const hmrBridge = {
    hmrSwap: (oldType: unknown, newType: unknown) => {
      renderer.hmrSwap(oldType, newType);
    },
  };
  globals.__tsazor = hmrBridge;
  let disposed = false;

  const app: TsazorApp = {
    services,
    navigationManager: services.get(NavigationManager as unknown as Token<NavigationManager>),
    /**
     * Disposes the component tree (parent first), removes the rendered DOM
     * from the container, then disposes the service provider as Blazor's host
     * does (the services it created, last first; a `registerValue` constant
     * stays with its owner), and removes the global listeners the app
     * installed: link interception and popstate (via its own
     * NavigationManager) and the HMR bridge.
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      // The head root first (it has no content providers of its own; the main
      // tree's PageTitle/HeadContent unregister with their own components).
      stopWaitingForHead();
      if (headState) {
        renderer.disposeComponent(headState);
        headState.range.remove();
      }
      renderer.disposeComponent(state);
      state.range.remove();
      releaseHold?.();
      // The components are gone, so nothing uses the services any more.
      services.dispose();
      ownedNavigation?.dispose();
      if (globals.__tsazor === hmrBridge) delete globals.__tsazor;
    },
  };
  renderers.set(app, renderer);
  return app;
}
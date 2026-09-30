import { Renderer } from "./renderer/renderer.js";
import { NavigationManager } from "./navigation/navigation-manager.js";
import { ServiceCollection, ServiceProvider, type Token } from "./di/service-collection.js";
import type { ComponentBase } from "./components/component-base.js";
import type { ComponentDefinition } from "./components/component-definition.js";
import { RouteManifest, type RouteEntry } from "./routing/route-data.js";

/**
 * Blazor's WebAssemblyHostBuilder equivalent: wires renderer, DI and
 * navigation and mounts the root component.
 */
export interface TsazorAppOptions {
  /** Root component (a definition or a component class). */
  root: ComponentDefinition | (abstract new () => ComponentBase);
  /** DI registrations (Blazor's ConfigureServices analogue). */
  services?: (services: ServiceCollection) => void;
  /** Route manifest (from `virtual:tsazor-routes`); Router falls back to it. */
  routes?: RouteEntry[];
  /** DOM selector for the app root (default: #app). */
  selector?: string;
  /** Shared NavigationManager; a fresh one is created when omitted. */
  navigationManager?: NavigationManager;
}

export interface TsazorApp {
  readonly renderer: Renderer;
  readonly services: ServiceProvider;
  readonly navigationManager: NavigationManager;
  dispose(): void;
}

export function createTsazorApp(options: TsazorAppOptions): TsazorApp {
  const collection = new ServiceCollection();
  // An app-created NavigationManager is owned (and disposed) by the app; a
  // shared one passed in stays with its owner.
  const ownedNavigation = options.navigationManager ? null : new NavigationManager();
  collection.registerValue(NavigationManager as unknown as Token<NavigationManager>, options.navigationManager ?? ownedNavigation!);
  if (options.routes) {
    collection.registerValue(RouteManifest as unknown as Token<RouteManifest>, new RouteManifest(options.routes));
  }
  options.services?.(collection);
  const services = collection.build();

  const container = document.querySelector(options?.selector ?? "#app");
  if (!container) {
    throw new Error(`Tsazor app root element not found (selector: '${options?.selector ?? "#app"}').`);
  }

  const renderer = new Renderer(services);
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

  return {
    renderer,
    services,
    navigationManager: services.get(NavigationManager as unknown as Token<NavigationManager>),
    /**
     * Disposes the component tree (parent first), removes the rendered DOM
     * from the container, and removes the global listeners the app installed:
     * link interception and popstate (via its own NavigationManager) and the
     * HMR bridge.
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.disposeComponent(state);
      state.range.remove();
      ownedNavigation?.dispose();
      if (globals.__tsazor === hmrBridge) delete globals.__tsazor;
    },
  };
}
import { Renderer } from "./renderer/renderer";
import { NavigationManager } from "./navigation/navigation-manager";
import { ServiceCollection, ServiceProvider, type Token } from "./di/service-collection";
import type { ComponentBase } from "./components/component-base";
import type { ComponentDefinition } from "./components/component-definition";
import { RouteManifest, type RouteEntry } from "./routing/route-data";

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
  collection.registerValue(NavigationManager as unknown as Token<NavigationManager>, options.navigationManager ?? new NavigationManager());
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
  (globalThis as unknown as { __tsazor?: { hmrSwap(oldType: unknown, newType: unknown): void } }).__tsazor = {
    hmrSwap: (oldType, newType) => {
      renderer.hmrSwap(oldType, newType);
    },
  };

  return {
    renderer,
    services,
    navigationManager: services.get(NavigationManager as unknown as Token<NavigationManager>),
    dispose() {
      renderer.disposeComponent(state);
    },
  };
}
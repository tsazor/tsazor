import { componentInternals } from "../components/component-internals.js";
import type { ComponentBase } from "../components/component-base.js";
import type { ServiceProvider, Token } from "./service-collection.js";

/**
 * DI context for component construction. Field initializers run in the
 * constructor, so the renderer activates the provider around instantiation
 * and components remember their scope for later resolutions.
 */
let activeProvider: ServiceProvider | null = null;

/**
 * Services resolved during the active component construction that carry the
 * auto-render marker (E8, design-localization.md §3): the renderer drains the
 * array after construction and has the component observe each entry, so
 * injecting a culture-aware service (`@inject StringLocalizer L`) re-renders
 * the component on its notifications without `observe` boilerplate.
 */
let pendingAutoObserve: unknown[] | null = null;

/**
 * @internal The auto-render marker (decision D-L6: culture-aware services
 * only — `CultureService` and `StringLocalizer` — not every subscribable
 * service; generalizing changes what every store injection means).
 */
export const AUTO_RENDER: unique symbol = Symbol("tsazor.autoRender");

/** @internal Marks a service: consumers that inject it re-render on its notifications. */
export function markAutoRender(service: object): void {
  Object.defineProperty(service, AUTO_RENDER, { value: true, configurable: true });
}

/** @internal Whether a resolved service carries the auto-render marker. */
export function isAutoRender(service: unknown): boolean {
  return typeof service === "object" && service !== null && (service as Record<symbol, unknown>)[AUTO_RENDER] === true;
}

/**
 * @internal Adds a marked service to the construction's collection (the
 * renderer drains it); returns false outside a construction — the caller then
 * observes directly (ComponentBase.inject from a lifecycle method).
 */
export function collectAutoObserve(service: unknown): boolean {
  if (pendingAutoObserve === null || !isAutoRender(service)) return false;
  pendingAutoObserve.push(service);
  return true;
}

/** @internal Activates a provider for `work`; `autoObserve` (the renderer's construction call) collects auto-render services. */
export function withServices<T>(provider: ServiceProvider, work: () => T, autoObserve?: unknown[]): T {
  const previous = activeProvider;
  const previousPending = pendingAutoObserve;
  activeProvider = provider;
  pendingAutoObserve = autoObserve ?? null;
  try {
    return work();
  } finally {
    activeProvider = previous;
    pendingAutoObserve = previousPending;
  }
}

/** @internal */
export function currentProvider(): ServiceProvider | null {
  return activeProvider;
}

/** Module-level `@inject` helper used by compiler-generated components. */
export function inject<T>(token: Token<T>): T {
  const provider = currentProvider();
  if (!provider) {
    throw new Error(`inject() called outside component construction: ${String((token as { name?: string }).name ?? token)}`);
  }
  const service = provider.get(token);
  // E8 auto-render: a marked service resolved during construction is
  // collected; the renderer has the component observe it after construction.
  collectAutoObserve(service);
  return service;
}

/** The provider the renderer used to construct this component. */
export function getCurrentServices(component: ComponentBase): ServiceProvider | null {
  return (componentInternals.services(component) as ServiceProvider | null) ?? activeProvider;
}
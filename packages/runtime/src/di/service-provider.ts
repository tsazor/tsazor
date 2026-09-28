import type { ComponentBase } from "../components/component-base";
import type { ServiceProvider, Token } from "./service-collection";

/**
 * DI context for component construction. Field initializers run in the
 * constructor, so the renderer activates the provider around instantiation
 * and components remember their scope for later resolutions.
 */
let activeProvider: ServiceProvider | null = null;

/** @internal Activates a provider for the duration of `work`. */
export function withServices<T>(provider: ServiceProvider, work: () => T): T {
  const previous = activeProvider;
  activeProvider = provider;
  try {
    return work();
  } finally {
    activeProvider = previous;
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
  return provider.get(token);
}

/** The provider the renderer used to construct this component. */
export function getCurrentServices(component: ComponentBase): ServiceProvider | null {
  return (component.componentServices as ServiceProvider | null) ?? activeProvider;
}
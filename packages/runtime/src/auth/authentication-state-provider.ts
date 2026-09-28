import type { Token } from "../di/service-collection";
import { ANONYMOUS, AuthenticationState } from "./authentication-state";

type AuthenticationStateChangedHandler = (state: AuthenticationState) => void;

/**
 * Blazor's AuthenticationStateProvider: supplies the current user and
 * notifies subscribers on changes (login/logout). Apps subclass this — the
 * runtime only consumes it via the ServiceProvider.
 */
export abstract class AuthenticationStateProvider {
  private readonly subscribers = new Set<AuthenticationStateChangedHandler>();
  private cachedState?: AuthenticationState;

  /** Resolves the current state; may be async (e.g. validating a token). */
  abstract getState(): Promise<AuthenticationState>;

  /** The most recently resolved state, if any (no request started). */
  peekState(): AuthenticationState | undefined {
    return this.cachedState;
  }

  /** Blazor's NotifyAuthenticationStateChanged (login/logout happened). */
  protected notifyAuthenticationStateChanged(state: AuthenticationState): void {
    this.cachedState = state;
    for (const subscriber of [...this.subscribers]) {
      subscriber(state);
    }
  }

  subscribe(handler: AuthenticationStateChangedHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }
}

/**
 * Subscribes `apply` to the AuthenticationStateProvider registered in
 * `services` and resolves the current state once. Without a provider the
 * app renders as anonymous (Blazor throws — here the auth package is
 * optional, so a missing registration degrades gracefully).
 *
 * Returns the unsubscribe function (for the component's dispose()).
 */
export function watchAuthenticationState(
  services: ServiceProviderLike | undefined,
  apply: (state: AuthenticationState) => void,
): () => void {
  const provider = services?.tryGet(AuthenticationStateProvider);
  if (!provider) {
    apply(ANONYMOUS);
    return () => undefined;
  }
  const unsubscribe = provider.subscribe(apply);
  void provider
    .getState()
    .then(apply)
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[tasor] AuthenticationStateProvider.getState() failed:", error);
      apply(ANONYMOUS);
    });
  return unsubscribe;
}

/** Structural subset of ServiceProvider the watcher needs (avoids a DI import cycle). */
interface ServiceProviderLike {
  tryGet<T>(token: Token<T>): T | undefined;
}
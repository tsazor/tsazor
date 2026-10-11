import type { Token } from "../di/service-collection.js";
import { ANONYMOUS, AuthenticationState } from "./authentication-state.js";

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
  abstract getAuthenticationStateAsync(): Promise<AuthenticationState>;

  /** The most recently resolved state, if any (no request started). */
  peekState(): AuthenticationState | undefined {
    return this.cachedState;
  }

  /**
   * Bumped by every notification. watchAuthenticationState compares it
   * before and after its getAuthenticationStateAsync() request: a result
   * that arrives after a newer notification is stale and dropped.
   */
  get notificationVersion(): number {
    return this.version;
  }

  private version = 0;

  /** Blazor's NotifyAuthenticationStateChanged (login/logout happened). */
  protected notifyAuthenticationStateChanged(state: AuthenticationState): void {
    this.version++;
    this.cachedState = state;
    for (const subscriber of [...this.subscribers]) {
      subscriber(state);
    }
  }

  /**
   * Calls `handler` with the new state on every notification (Blazor's
   * `AuthenticationStateChanged` event). Returns the unsubscribe function.
   */
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
  let active = true;
  const unsubscribe = provider.subscribe(apply);
  // The initial request is tokened with the notification version: if a
  // login/logout notification arrives while getAuthenticationStateAsync()
  // is pending, the late result (or failure) must not overwrite the newer
  // state.
  const requestVersion = provider.notificationVersion;
  const isCurrent = () => active && provider.notificationVersion === requestVersion;
  void provider.getAuthenticationStateAsync().then(
    (state) => {
      if (isCurrent()) apply(state);
    },
    (error) => {
      // eslint-disable-next-line no-console
      console.error("[tsazor] AuthenticationStateProvider.getAuthenticationStateAsync() failed:", error);
      if (isCurrent()) apply(ANONYMOUS);
    },
  );
  return () => {
    active = false;
    unsubscribe();
  };
}

/** Structural subset of ServiceProvider the watcher needs (avoids a DI import cycle). */
interface ServiceProviderLike {
  tryGet<T>(token: Token<T>): T | undefined;
}
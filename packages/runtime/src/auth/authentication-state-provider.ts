import type { Token } from "../di/service-collection.js";
import { ANONYMOUS, AuthenticationState } from "./authentication-state.js";

type AuthenticationStateChangedHandler = (state: AuthenticationState) => void;

/** Options for `AuthenticationStateProvider.subscribe`. */
export interface AuthenticationStateSubscribeOptions {
  /** Called when a notification's promise starts; the handler follows once it resolves. */
  onPending?: () => void;
}

/**
 * Blazor's AuthenticationStateProvider: supplies the current user and
 * notifies subscribers on changes (login/logout). Apps subclass this — the
 * runtime only consumes it via the ServiceProvider.
 */
export abstract class AuthenticationStateProvider {
  private readonly subscribers = new Set<{ handler: AuthenticationStateChangedHandler; onPending?: () => void }>();
  private cachedState?: AuthenticationState;

  /** Resolves the current state; may be async (e.g. validating a token). */
  abstract getAuthenticationStateAsync(): Promise<AuthenticationState>;

  /** @internal The most recently resolved state, if any (no request started). */
  peekState(): AuthenticationState | undefined {
    return this.cachedState;
  }

  /**
   * @internal Bumped by every notification. watchAuthenticationState compares it
   * before and after its getAuthenticationStateAsync() request: a result
   * that arrives after a newer notification is stale and dropped.
   */
  get notificationVersion(): number {
    return this.version;
  }

  private version = 0;

  /**
   * Blazor's NotifyAuthenticationStateChanged (login/logout happened). Takes
   * the new state, or a promise of it as Blazor takes a `Task` — such as
   * `this.getAuthenticationStateAsync()` when the user needs a request (roles
   * from a profile endpoint). Until a promise resolves, AuthorizeView and
   * AuthorizeRouteView show their Authorizing content, and no in-between user
   * reaches anyone. A newer notification wins over a pending promise; a
   * rejected one counts as signed out.
   */
  protected notifyAuthenticationStateChanged(state: AuthenticationState | Promise<AuthenticationState>): void {
    const version = ++this.version;
    if (!isPromiseLike(state)) {
      this.publish(state);
      return;
    }
    for (const subscriber of [...this.subscribers]) {
      subscriber.onPending?.();
    }
    state.then(
      (resolved) => {
        if (this.version === version) this.publish(resolved);
      },
      (error: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[tsazor] The state passed to notifyAuthenticationStateChanged() failed:", error);
        if (this.version === version) this.publish(ANONYMOUS);
      },
    );
  }

  private publish(state: AuthenticationState): void {
    this.cachedState = state;
    for (const subscriber of [...this.subscribers]) {
      subscriber.handler(state);
    }
  }

  /**
   * Calls `handler` with the new state on every notification (Blazor's
   * `AuthenticationStateChanged` event; a promise is awaited first, and
   * `onPending` tells when one starts). Returns the unsubscribe function.
   */
  subscribe(handler: AuthenticationStateChangedHandler, options: AuthenticationStateSubscribeOptions = {}): () => void {
    const subscriber = { handler, onPending: options.onPending };
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }
}

function isPromiseLike(value: AuthenticationState | Promise<AuthenticationState>): value is Promise<AuthenticationState> {
  return typeof (value as Partial<Promise<AuthenticationState>>).then === "function";
}

/**
 * Subscribes `apply` to the AuthenticationStateProvider registered in
 * `services` and resolves the current state once. Without a provider the
 * app renders as anonymous (Blazor throws — here the auth package is
 * optional, so a missing registration degrades gracefully).
 *
 * `onPending` hears when a notification's promise starts (AuthorizeView
 * shows its Authorizing content then). Returns the unsubscribe function (for
 * the component's dispose()).
 */
export function watchAuthenticationState(
  services: ServiceProviderLike | undefined,
  apply: (state: AuthenticationState) => void,
  onPending?: () => void,
): () => void {
  const provider = services?.tryGet(AuthenticationStateProvider);
  if (!provider) {
    apply(ANONYMOUS);
    return () => undefined;
  }
  let active = true;
  const unsubscribe = provider.subscribe(apply, { onPending });
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
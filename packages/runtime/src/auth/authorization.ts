import type { ClaimsPrincipal } from "./authentication-state.js";

/**
 * A named policy check: user → access decision, at once or later (a server round trip). Blazor's IAuthorizationPolicy
 * analogue; a promise is Blazor's async requirement handler.
 */
export type AuthorizationPolicy = (user: ClaimsPrincipal) => boolean | Promise<boolean>;

/**
 * What a user must satisfy to get access (Blazor's `[Authorize(Roles, Policy)]`
 * / `AuthorizeView` parameters). Roles and policy both apply when both are set;
 * with neither, being signed in suffices.
 */
export interface AuthorizationRequirements {
  /** Roles that grant access (user must have at least one). */
  readonly roles?: readonly string[];
  /** A policy name registered with `AuthorizationService.addPolicy`. */
  readonly policy?: string;
}

/**
 * Blazor's IAuthorizationService analogue: role checks are built in, named
 * policies are registered functions (TS has no reflection-based attributes).
 */
export class AuthorizationService {
  /** Policy name → check. Unknown policies deny (secure default). */
  readonly #policies = new Map<string, AuthorizationPolicy>();

  /** Registers (or replaces) the policy `name` (Blazor's `AddPolicy`). Returns this service, for chaining. */
  addPolicy(name: string, policy: AuthorizationPolicy): this {
    this.#policies.set(name, policy);
    return this;
  }

  /**
   * Whether `user` meets `requirements` (Blazor's `AuthorizeAsync`): a role check needs a signed-in user with one of
   * the roles, a policy needs a registered check that passes; no requirements means signed in. The answer is a
   * boolean, or a promise of one when the policy decides asynchronously.
   */
  isAuthorized(user: ClaimsPrincipal, requirements?: AuthorizationRequirements): boolean | Promise<boolean> {
    const roles = requirements?.roles;
    const policy = requirements?.policy;
    if (roles?.length) {
      if (!user.isAuthenticated || !roles.some((role) => user.roles.includes(role))) {
        return false;
      }
    }
    if (policy) {
      const check = this.#policies.get(policy);
      if (!check) return false;
      return check(user);
    }
    // No requirements → Blazor's default rule: authentication suffices.
    return roles?.length ? true : user.isAuthenticated;
  }
}

/**
 * @internal One component's access decision (AuthorizeView, AuthorizeRouteView). A synchronous answer is asked anew on
 * every render; an asynchronous one is kept for this user and these requirements, and `settled` re-renders once it
 * arrives (until then the decision is undefined: Authorizing).
 */
export class AuthorizationDecision {
  #user: ClaimsPrincipal | undefined;
  #key = "";
  #value: boolean | undefined;
  #async = false;

  decide(
    service: AuthorizationService,
    user: ClaimsPrincipal,
    requirements: AuthorizationRequirements,
    settled: () => void,
    failed: (error: unknown) => void,
  ): boolean | undefined {
    const key = JSON.stringify([requirements.roles ?? [], requirements.policy ?? ""]);
    if (this.#async && this.#user === user && this.#key === key) return this.#value;
    const result = service.isAuthorized(user, requirements);
    if (typeof result === "boolean") {
      this.#async = false;
      return result;
    }
    this.#async = true;
    this.#user = user;
    this.#key = key;
    this.#value = undefined;
    result.then(
      (value) => {
        if (this.#user !== user || this.#key !== key) return;
        this.#value = value;
        settled();
      },
      (error: unknown) => {
        if (this.#user !== user || this.#key !== key) return;
        this.#value = false;
        failed(error);
      },
    );
    return undefined;
  }
}

/**
 * @internal The service AuthorizeView and AuthorizeRouteView use when the app registered none: roles and signed-in
 * checks only (an app with policies registers its own AuthorizationService).
 */
export const defaultAuthorizationService = new AuthorizationService();
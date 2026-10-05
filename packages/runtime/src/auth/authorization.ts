import type { ClaimsPrincipal } from "./authentication-state.js";

/** A named policy check: user → access decision. Blazor's IAuthorizationPolicy analogue. */
export type AuthorizationPolicy = (user: ClaimsPrincipal) => boolean;

/**
 * What a user must satisfy to get access (Blazor's `[Authorize(Roles, Policy)]`
 * / `AuthorizeView` parameters). Roles and policy both apply when both are set;
 * with neither, being signed in suffices.
 */
export interface AuthorizationRequirements {
  /** Roles that grant access (user must have at least one). */
  readonly roles?: readonly string[];
  /** Policy name resolved against AuthorizationService.policies. */
  readonly policy?: string;
}

/**
 * Blazor's IAuthorizationService analogue: role checks are built in, named
 * policies are registered functions (TS has no reflection-based attributes).
 */
export class AuthorizationService {
  /** Policy name → check function. Unknown policies deny (secure default). */
  readonly policies: Record<string, AuthorizationPolicy> = {};

  /**
   * Whether `user` meets `requirements` (Blazor's `AuthorizeAsync`): a role
   * check needs a signed-in user with one of the roles, a policy needs a
   * registered check that passes; no requirements means signed in.
   */
  isAuthorized(user: ClaimsPrincipal, requirements?: AuthorizationRequirements): boolean {
    const roles = requirements?.roles;
    const policy = requirements?.policy;

    if (roles?.length) {
      if (!user.isAuthenticated || !roles.some((role) => user.roles.includes(role))) {
        return false;
      }
    }
    if (policy) {
      const check = this.policies[policy];
      if (!check || !check(user)) {
        return false;
      }
    }
    if (!roles?.length && !policy) {
      // No requirements → Blazor's default rule: authentication suffices.
      return user.isAuthenticated;
    }
    return true;
  }
}

/**
 * Module-level fallback used when the app did not register an
 * AuthorizationService in DI — policies can be registered on it directly.
 */
export const defaultAuthorizationService = new AuthorizationService();
/**
 * Blazor's AuthenticationState / ClaimsPrincipal, reduced to what UI
 * components need. `AuthenticationState` is a class so cascading parameters
 * can match it by type (`@CascadingParameter({ type: AuthenticationState })`).
 */

/** A single claim (Blazor's Claim as type/value pair). */
export interface Claim {
  readonly type: string;
  readonly value: string;
}

/** Blazor's ClaimsPrincipal as a plain data object. */
export interface ClaimsPrincipal {
  readonly name: string;
  readonly isAuthenticated: boolean;
  readonly roles: readonly string[];
  readonly claims: readonly Claim[];
}

/** A not-signed-in user (Blazor's anonymous ClaimsPrincipal). */
export function anonymousUser(): ClaimsPrincipal {
  return { name: "", isAuthenticated: false, roles: [], claims: [] };
}

/** Builds an authenticated user (login helpers, test providers). */
export function createUser(options: { name: string; roles?: readonly string[]; claims?: readonly Claim[] }): ClaimsPrincipal {
  return {
    name: options.name,
    isAuthenticated: true,
    roles: options.roles ?? [],
    claims: options.claims ?? [],
  };
}

/** The identity a component renders against (user + authentication flag). */
export class AuthenticationState {
  constructor(readonly user: ClaimsPrincipal) {}
}

/** Shared anonymous state used before a provider resolves. */
export const ANONYMOUS = new AuthenticationState(anonymousUser());
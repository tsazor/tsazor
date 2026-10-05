/**
 * Blazor's AuthenticationState / ClaimsPrincipal, reduced to what UI
 * components need. `AuthenticationState` is a class so cascading parameters
 * can match it by type (`@CascadingParameter({ type: AuthenticationState })`).
 */

/** A single claim (Blazor's Claim as type/value pair). */
export interface Claim {
  /** The claim type, e.g. `"email"` (Blazor's `Claim.Type`). */
  readonly type: string;
  /** The claim value (Blazor's `Claim.Value`). */
  readonly value: string;
}

/** Blazor's ClaimsPrincipal as a plain data object. */
export interface ClaimsPrincipal {
  /** The user name (Blazor's `Identity.Name`); empty for the anonymous user. */
  readonly name: string;
  /** Whether the user is signed in (Blazor's `Identity.IsAuthenticated`). */
  readonly isAuthenticated: boolean;
  /** The user's roles, checked by `AuthorizeView` `roles` and `AuthorizationService` (Blazor's `IsInRole`). */
  readonly roles: readonly string[];
  /** Further claims about the user (Blazor's `Claims`). */
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
  /** Wraps `user` (Blazor's `new AuthenticationState(principal)`). */
  constructor(
    /** The current user (Blazor's `AuthenticationState.User`). */
    readonly user: ClaimsPrincipal,
  ) {}
}

/** Shared anonymous state used before a provider resolves. */
export const ANONYMOUS = new AuthenticationState(anonymousUser());
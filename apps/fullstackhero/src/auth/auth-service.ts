import { AuthenticationState, AuthenticationStateProvider, AuthorizationService, anonymousUser, createUser, type ClaimsPrincipal } from "@tsazor/runtime";
import type { QueryClient } from "@tanstack/query-core";
import { tokenStore } from "@/auth/token-store";
import { decodeJwt, isTokenExpired, type JwtClaims } from "@/auth/jwt";
import { issueToken } from "@/auth/api";
import { refreshAccessToken } from "@/lib/api-client";
import { getMyPermissions } from "@/api/users";

export type AuthUser = {
  id: string;
  email?: string;
  name?: string;
  tenant?: string;
  permissions: string[];
};

/** The claim type of a permission in the principal (the JWT carries none: they come from /identity/permissions). */
export const PERMISSION_CLAIM = "permission";

function claimsToUser(claims: JwtClaims | null, permissions: string[]): AuthUser | null {
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    tenant: claims.tenant,
    permissions,
  };
}

// Read the stored session, treating an EXPIRED access token as "not usable
// yet": the boot effect attempts a silent refresh before we trust it. A
// decodable-but-expired token must not flip the app to authenticated, or it
// renders protected surfaces that 401 in a loop instead of refreshing.
function readStoredSession(): { claims: JwtClaims | null; usable: boolean } {
  const claims = decodeJwt(tokenStore.getAccessToken());
  return { claims, usable: claims !== null && !isTokenExpired(claims) };
}

/**
 * auth/auth-context.tsx's AuthProvider as a service — and the app's AuthenticationStateProvider, so Tsazor's
 * AuthorizeRouteView and AuthorizeView decide from it (the original's ProtectedRoute and RouteGuard). The user is the
 * stored JWT's claims plus the permissions fetched from /identity/permissions, as in the original:
 *
 * - **Restoring a session** (`isInitializing`): an expired access token with a refresh token is renewed once at
 *   boot before the app trusts it — the state stays pending meanwhile (AuthorizeRouteView's Authorizing).
 * - **Hydrating permissions** (`permissionsHydrated`): a new subject's permissions are fetched; until then the state
 *   is pending too (the original's "Resolving permissions" instead of a 403 flash). Cached ones count as hydrated.
 * - Every token change (login, refresh, logout, another tab's storage event) rebuilds the user.
 *
 * Components that show the user observe its changes (`this.observe(auth.changes)`).
 */
export class AuthService extends AuthenticationStateProvider {
  user: AuthUser | null;
  isInitializing: boolean;
  permissionsHydrated: boolean;

  private lastHydratedSubject: string | null;
  private fetchingSubject: string | null = null;
  private readonly listeners = new Set<() => void>();
  private ready: Promise<AuthenticationState> | null = null;
  private resolveReady: ((state: AuthenticationState) => void) | null = null;

  constructor(private readonly queryClient: QueryClient) {
    super();
    const { claims, usable } = readStoredSession();
    this.user = usable ? claimsToUser(claims, tokenStore.getPermissions()) : null;
    // When the stored access token is missing/expired but a refresh token is
    // present, attempt one silent refresh at boot before rendering.
    this.isInitializing = !usable && tokenStore.getRefreshToken() !== null;
    // Cold-start: if we already have a cached permissions list, treat as hydrated
    // so route guards don't flash 403. Otherwise, wait for the fetch.
    this.permissionsHydrated = !tokenStore.getAccessToken() || tokenStore.getPermissions().length > 0;
    this.lastHydratedSubject = this.user?.id ?? null;

    tokenStore.subscribe(() => this.rebuild());
    // Cross-tab auth sync: a `storage` event fires when ANOTHER tab logs in/out.
    // Scoped to the token keys so the inactivity heartbeat doesn't trigger a rebuild.
    window.addEventListener("storage", (event) => {
      if (event.key !== null && event.key !== "fsh.admin.accessToken" && event.key !== "fsh.admin.refreshToken") return;
      this.rebuild();
    });

    if (this.isInitializing) void this.restoreSession();
    else this.hydratePermissions();
  }

  get isAuthenticated(): boolean {
    return this.user !== null;
  }

  override getAuthenticationStateAsync(): Promise<AuthenticationState> {
    return this.settled() ? Promise.resolve(this.state()) : this.pending();
  }

  /** For components (`this.observe(auth.changes)`): a change of anything the service holds. */
  readonly changes = {
    subscribe: (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
  };

  async login(input: { email: string; password: string; tenant: string }): Promise<void> {
    tokenStore.setTenant(input.tenant);
    // Stale permissions from a previous user must not leak into the new
    // session — clear before issuing the token so hydration re-fetches from scratch.
    tokenStore.setPermissions([]);
    this.permissionsHydrated = false;
    this.lastHydratedSubject = null;
    const tokens = await issueToken(input);
    tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
  }

  logout(): void {
    tokenStore.clear();
    this.queryClient.clear();
  }

  /** Re-fetch the permission set for the signed-in user (after a role assignment of the current user changed). */
  async refreshPermissions(): Promise<void> {
    try {
      tokenStore.setPermissions(await getMyPermissions());
    } catch {
      /* swallow — see hydratePermissions */
    }
  }

  private async restoreSession(): Promise<void> {
    try {
      await refreshAccessToken();
    } catch {
      // Refresh token dead (expired, revoked, or DB reseeded) — drop the
      // stale session so routing falls through to /login cleanly.
      tokenStore.clear();
    } finally {
      this.isInitializing = false;
      this.rebuild();
    }
  }

  private rebuild(): void {
    this.user = claimsToUser(decodeJwt(tokenStore.getAccessToken()), tokenStore.getPermissions());
    this.hydratePermissions();
    this.changed();
  }

  /** Fetch the permissions whenever the signed-in subject changes — cold start, login, account swap. */
  private hydratePermissions(): void {
    const user = this.user;
    if (!user) {
      this.lastHydratedSubject = null;
      this.permissionsHydrated = true;
      return;
    }
    if (this.lastHydratedSubject === user.id && this.permissionsHydrated) return;
    if (this.fetchingSubject === user.id) return;
    this.lastHydratedSubject = user.id;
    this.fetchingSubject = user.id;
    void (async () => {
      try {
        const permissions = await getMyPermissions();
        if (this.user?.id !== user.id) return;
        this.permissionsHydrated = true;
        // setPermissions emits: the user is rebuilt with the new list.
        tokenStore.setPermissions(permissions);
      } catch {
        // Permissions fetch failure shouldn't sign the user out — the route
        // guards will treat them as zero-permission until the next refresh.
        if (this.user?.id === user.id) {
          this.permissionsHydrated = true;
          this.changed();
        }
      } finally {
        if (this.fetchingSubject === user.id) this.fetchingSubject = null;
      }
    })();
  }

  private settled(): boolean {
    return !this.isInitializing && (this.user === null || this.permissionsHydrated);
  }

  private pending(): Promise<AuthenticationState> {
    this.ready ??= new Promise((resolve) => (this.resolveReady = resolve));
    return this.ready;
  }

  private state(): AuthenticationState {
    return new AuthenticationState(this.principal());
  }

  private principal(): ClaimsPrincipal {
    const user = this.user;
    if (!user) return anonymousUser();
    return createUser({
      name: user.name ?? user.email ?? user.id,
      claims: [
        { type: "sub", value: user.id },
        ...(user.email ? [{ type: "email", value: user.email }] : []),
        ...(user.tenant ? [{ type: "tenant", value: user.tenant }] : []),
        ...user.permissions.map((permission) => ({ type: PERMISSION_CLAIM, value: permission })),
      ],
    });
  }

  private changed(): void {
    if (this.settled()) {
      const state = this.state();
      this.ready = null;
      const resolve = this.resolveReady;
      this.resolveReady = null;
      resolve?.(state);
      this.notifyAuthenticationStateChanged(state);
    } else {
      this.notifyAuthenticationStateChanged(this.pending());
    }
    for (const listener of [...this.listeners]) listener();
  }
}

/** One policy per permission (the original's RouteGuard `perms`): met when the user holds it. */
export function permissionPolicies(authorization: AuthorizationService, permissions: readonly string[]): void {
  for (const permission of permissions) {
    authorization.addPolicy(permission, (user) => user.claims.some((claim) => claim.type === PERMISSION_CLAIM && claim.value === permission));
  }
}

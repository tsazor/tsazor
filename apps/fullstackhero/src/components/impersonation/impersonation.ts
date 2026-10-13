import type { ImpersonationResponse } from "@/api/impersonation";
import type { ImpersonationGrantDto } from "@/api/impersonation-grants";
import type { UserDto } from "@/api/users";
import { env } from "@/env";

// impersonate-dialog.tsx's framework-free helpers, unchanged, and the "Re-open" prefill that
// pages/impersonation/list.tsx and active-grants-card.tsx both build.

export type DurationOption = { minutes: number; label: string };

export const DURATION_OPTIONS: DurationOption[] = [
  { minutes: 10, label: "10 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
];

/**
 * Open the dashboard in a new tab with the impersonation token in the URL
 * hash. Hash params don't get sent to servers and aren't logged in HTTP
 * referrers, so this is safer than a query-string handoff. The dashboard's
 * bootstrap reads the hash, calls tokenStore.beginImpersonation, then
 * history.replaceState() to strip the hash before any render.
 *
 * `expiresAt` is included so the dashboard can show a countdown.
 */
export function handoffToDashboard(response: ImpersonationResponse, tenantId: string): void {
  const params = new URLSearchParams();
  params.set("token", response.accessToken);
  params.set("tenant", tenantId);
  params.set("expiresAt", response.accessTokenExpiresAt);
  const url = `${env.dashboardUrl}/#impersonate?${params.toString()}`;
  // noopener+noreferrer so the opened tab can't navigate this one and the
  // referrer header is suppressed entirely (defense in depth — the hash
  // wouldn't be in the referrer anyway, but the rest of this URL would be).
  window.open(url, "_blank", "noopener,noreferrer");
}

export function labelFor(user: UserDto): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.userName || user.email || "Unnamed user";
}

/**
 * The user a "Re-open" pre-fills the impersonate dialog with: a minimal UserDto built from the grant's fields
 * rather than fetched by id — the dialog only needs (id, display name) to skip its picker step.
 */
export function prefillUserOf(grant: ImpersonationGrantDto | null): UserDto | undefined {
  return grant
    ? {
        id: grant.impersonatedUserId,
        userName: grant.impersonatedUserName ?? undefined,
        firstName: null,
        lastName: null,
        email: null,
        isActive: true,
        emailConfirmed: true,
      }
    : undefined;
}

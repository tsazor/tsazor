import "@/styles/globals.css";
// sonner's own (unlayered) rules, which the original's toasts show over globals.css's layered ones.
import "@/styles/sonner-toast.css";
import { AuthenticationStateProvider, AuthorizationService, createTsazorApp } from "@tsazor/runtime";
import { Toaster } from "@tsazor/ui";
import routes from "virtual:tsazor-routes";
import App from "@/App.tsazor";
import { loadRuntimeConfig } from "@/env";
import { AuthService, permissionPolicies } from "@/auth/auth-service";
import { ThemeService } from "@/components/theme/theme-service";
import {
  AuditingPermissions,
  BillingPermissions,
  IdentityPermissions,
  MultitenancyPermissions,
  WebhooksPermissions,
} from "@/lib/permissions";
import { queryClient } from "@/lib/query-client";
import { toaster } from "@/lib/toast";
import { RealtimeService } from "@/realtime/realtime-service";

// main.tsx: the runtime configuration (/config.json) is in memory before any module that reads env.* runs in a
// render, as in the original.
await loadRuntimeConfig();

// App.tsx's provider tree — ThemeProvider, QueryClientProvider, AuthProvider, RealtimeProvider, the Toaster — as
// services. TanStack Query's client is the framework-free core's (lib/query.ts observes it).
queryClient.mount();
const auth = new AuthService(queryClient);

// RouteGuard's `perms`: one policy per permission, met by the permissions fetched into the AuthService.
const authorization = new AuthorizationService();
const permissionGroups: unknown[] = [AuditingPermissions, BillingPermissions, IdentityPermissions, MultitenancyPermissions, WebhooksPermissions];
permissionPolicies(authorization, permissionGroups.flatMap(permissionsOf));

createTsazorApp({
  root: App,
  routes,
  selector: "#root",
  services: (services) => {
    services.registerValue(ThemeService, new ThemeService());
    services.registerValue(AuthService, auth);
    services.registerValue(AuthenticationStateProvider, auth);
    services.registerValue(AuthorizationService, authorization);
    services.registerValue(RealtimeService, new RealtimeService());
    services.registerValue(Toaster, toaster);
  },
});

/** The permission strings of lib/permissions.ts's nested constant objects. */
function permissionsOf(group: unknown): string[] {
  if (typeof group === "string") return [group];
  if (group && typeof group === "object") return Object.values(group).flatMap(permissionsOf);
  return [];
}

import type { AuthService } from "@/auth/auth-service";
import { filterNavSpec, sections, type NavSection } from "./nav-items";

/** sidebar.tsx's permission-filtered sections (none before the permissions are hydrated), shared with the drawer. */
export function visibleSections(auth: AuthService): NavSection[] {
  const granted = auth.permissionsHydrated ? (auth.user?.permissions ?? []) : [];
  return sections
    .map((section) => ({ ...section, items: filterNavSpec(section.items, granted) }))
    .filter((section) => section.items.length > 0);
}

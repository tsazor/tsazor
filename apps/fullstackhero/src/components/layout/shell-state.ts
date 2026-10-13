const COLLAPSED_KEY = "fsh.admin.sidebar.collapsed";

/**
 * The shell's own state, cascaded by AppShell to the sidebar, the topbar and the mobile drawer: sidebar.tsx's
 * useCollapsedSidebar (persisted in localStorage) and mobile-nav.tsx's MobileNavProvider (the drawer's open state).
 * Its parts observe it.
 */
export class ShellState {
  collapsed = readCollapsed();
  mobileNavOpen = false;
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(this.collapsed));
    } catch {
      /* storage unavailable */
    }
    this.changed();
  }

  setMobileNavOpen(open: boolean): void {
    if (open === this.mobileNavOpen) return;
    this.mobileNavOpen = open;
    this.changed();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** Persisted collapsed state, read on mount. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

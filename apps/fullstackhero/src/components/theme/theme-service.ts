type Theme = "light" | "dark";

const STORAGE_KEY = "fsh.admin.theme";

// Console is dark-first. We try storage → system pref → dark, in that order.
function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

/**
 * components/theme/theme-provider.tsx's ThemeProvider as a service: the theme is the `dark` class and the
 * color-scheme on <html> (Tailwind's `dark:` variant, globals.css), stored in localStorage. Components that show it
 * observe its changes (`this.observe(theme.changes)`).
 */
export class ThemeService {
  theme: Theme = resolveInitialTheme();
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.apply();
  }

  readonly changes = {
    subscribe: (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
  };

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.apply();
    for (const listener of [...this.listeners]) listener();
  }

  toggle(): void {
    this.setTheme(this.theme === "dark" ? "light" : "dark");
  }

  private apply(): void {
    const root = document.documentElement;
    root.classList.toggle("dark", this.theme === "dark");
    root.style.colorScheme = this.theme;
    window.localStorage.setItem(STORAGE_KEY, this.theme);
  }
}

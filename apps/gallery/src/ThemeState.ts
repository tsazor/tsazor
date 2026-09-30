/**
 * App-wide theme state: the single source of truth for light/dark. Components
 * read it via DI; the FluentProvider receives it as a parameter so the token
 * palette follows. The document attribute drives the CSS token blocks in
 * `@tsazor/fluent/fluent.css` (html-level, so the whole page re-themes).
 */
export class ThemeState {
  private listeners = new Set<() => void>();

  /** Applied theme: "light" | "dark". */
  private current = this.initial();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get theme(): string {
    return this.current;
  }

  /** Toggles light/dark and re-applies to <html>. */
  toggle(): void {
    this.setTheme(this.current === "dark" ? "light" : "dark");
  }

  setTheme(theme: string): void {
    this.current = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.fluentTheme = this.current;
    for (const listener of this.listeners) listener();
  }

  /** OS preference until the user picks explicitly. */
  private initial(): string {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
}

// @inject resolves services as default exports of a file named exactly like
// the type (Blazor: file name = type name).
export default ThemeState;
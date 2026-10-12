import type { Intent } from "./vocabulary.js";

/** What `Toaster.show` takes. */
export interface ToastOptions {
  /** Short headline. */
  title?: string;
  /** The message. */
  message?: string;
  /** Color role. Default `info`; `danger` toasts are announced assertively. */
  intent?: Intent;
  /** Milliseconds until the toast closes itself; 0 keeps it until closed. Default 5000. */
  timeout?: number;
  /** A button besides Close ("Chat?" opens the chat): the toast closes after its click. */
  action?: ToastAction;
}

/** A toast's button besides Close (MudBlazor's snackbar `Action`): its label, and what a click does. */
export interface ToastAction {
  readonly label: string;
  /** Runs on the click; the toast closes then. */
  readonly onClick: () => void | Promise<void>;
}

/** One toast on screen. */
export interface Toast {
  readonly id: number;
  readonly title?: string;
  readonly message?: string;
  readonly intent: Intent;
  readonly action?: ToastAction;
}

interface Entry extends Toast {
  timeout: number;
  remaining: number;
  started: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * The app's toasts, as a service (MudBlazor's ISnackbar, Radzen's
 * NotificationService): any component injects it and calls `show`; a skin's
 * `ToastRegion` renders the list. Register it once:
 * `services.registerType(Toaster, { singleton: true })`.
 *
 * Toasts that close by themselves pause while the pointer is over them or
 * focus is in them (WCAG 2.2.1, Timing Adjustable) — the region calls
 * `pause`/`resume`.
 */
export class Toaster {
  private entries: Entry[] = [];
  private next = 1;
  private readonly listeners = new Set<() => void>();

  /** The toasts on screen, oldest first. */
  get toasts(): readonly Toast[] {
    return this.entries;
  }

  /** Shows a toast; returns its id. */
  show(options: ToastOptions): number {
    const id = this.next++;
    const timeout = Math.max(0, options.timeout ?? 5000);
    const entry: Entry = { id, title: options.title, message: options.message, intent: options.intent ?? "info", action: options.action, timeout, remaining: timeout, started: Date.now(), timer: undefined };
    this.entries = [...this.entries, entry];
    this.start(entry);
    this.changed();
    return id;
  }

  /** Closes a toast. */
  dismiss(id: number): void {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries = this.entries.filter((candidate) => candidate !== entry);
    this.changed();
  }

  /** Runs a toast's action and closes the toast (a skin's action button calls it). */
  async act(id: number): Promise<void> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry?.action) return;
    this.dismiss(id);
    await entry.action.onClick();
  }

  /** Stops a toast's countdown (pointer over it, focus in it). */
  pause(id: number): void {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry?.timer) return;
    clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.started));
  }

  /** Continues a paused countdown. */
  resume(id: number): void {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry || entry.timer || entry.timeout === 0) return;
    this.start(entry);
  }

  /** Listens to changes of the list (`this.observe(toaster)` in a component); returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private start(entry: Entry): void {
    if (entry.timeout === 0) return;
    entry.started = Date.now();
    entry.timer = setTimeout(() => this.dismiss(entry.id), Math.max(entry.remaining, 1000));
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

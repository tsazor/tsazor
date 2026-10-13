import { activityStore, evaluateInactivity, type InactivityPhase } from "@/auth/inactivity";

// Genuine user-intent signals. Throttled before they touch storage so a
// mousemove storm can't hammer localStorage.
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
  "mousemove",
] as const;

const WRITE_THROTTLE_MS = 1_000;
const TICK_MS = 1_000;

type Options = {
  idleMs: number;
  warningMs: number;
  /** Fired once when the session crosses the expiry threshold. */
  onExpire: () => void;
};

/**
 * auth/use-inactivity-timeout.ts's hook as a class — the same state machine, the hook's refs as fields. Tracks a
 * cross-tab "last activity" timestamp, ticks once a second, and surfaces the current phase + seconds left so a
 * warning modal can render. Activity in any tab keeps every tab alive; while THIS tab shows the warning it stops
 * recording passive activity so the prompt stays meaningful (only an explicit reset, or real activity in another
 * tab, dismisses it). `start` is the hook's effect with `enabled`, `stop` its cleanup; the component observes it.
 */
export class InactivityTimer {
  phase: InactivityPhase = "active";
  secondsLeft = 0;

  private lastWrite = 0;
  private expired = false;
  private stopWatching: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: Options) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get running(): boolean {
    return this.stopWatching !== null;
  }

  start(): void {
    if (this.stopWatching) return;
    // Seed the shared stamp on enable so a fresh login isn't instantly idle.
    // The stamp lives in localStorage and survives logout, so a value left over
    // from a previous (possibly expired) session would otherwise make the next
    // login evaluate as "warning"/"expired" on the first tick and sign the user
    // straight back out. Refresh it when it's missing OR already past the idle
    // threshold; a still-fresh stamp from an active sibling tab is preserved.
    const seeded = activityStore.get();
    const stale = seeded <= 0 || Date.now() - seeded >= this.options.idleMs;
    if (stale) activityStore.set(Date.now());
    this.expired = false;

    const record = (): void => this.recordActivity();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, record, { passive: true, capture: true });
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key === activityStore.key) this.evaluateNow();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") this.evaluateNow();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    this.evaluateNow();
    const intervalId = window.setInterval(() => this.evaluateNow(), TICK_MS);

    this.stopWatching = () => {
      window.clearInterval(intervalId);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, record, { capture: true } as EventListenerOptions);
      }
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }

  stop(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.expired = false;
    this.set("active", 0);
  }

  /** Explicit "I'm here" — refresh the shared stamp and drop back to active. */
  dismiss(): void {
    const now = Date.now();
    this.lastWrite = now;
    activityStore.set(now);
    this.expired = false;
    this.set("active", 0);
  }

  private evaluateNow(): void {
    const { phase, secondsLeft } = evaluateInactivity(Date.now(), activityStore.get(), this.options.idleMs, this.options.warningMs);
    this.set(phase, secondsLeft);
    if (phase === "expired" && !this.expired) {
      this.expired = true;
      this.options.onExpire();
    }
  }

  private recordActivity(): void {
    // Freeze passive activity once we're warning/expired in this tab.
    if (this.phase !== "active") return;
    const now = Date.now();
    if (now - this.lastWrite < WRITE_THROTTLE_MS) return;
    this.lastWrite = now;
    activityStore.set(now);
  }

  private set(phase: InactivityPhase, secondsLeft: number): void {
    if (phase === this.phase && secondsLeft === this.secondsLeft) return;
    this.phase = phase;
    this.secondsLeft = secondsLeft;
    for (const listener of [...this.listeners]) listener();
  }
}

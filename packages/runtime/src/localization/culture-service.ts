/**
 * CultureService — the app-wide culture state (E8, design-localization.md §1,
 * decision D-L1: a DI service, not ambient `CultureInfo.CurrentCulture`
 * state — `NavigationManager` is the precedent; tests and iframe apps stay
 * isolated).
 *
 * The port's priority rule is the state machine's shape: an explicit selection
 * (URL parameter, host postMessage) beats the user profile (token response),
 * and once set it *locks* profile values out — "explicitly set locks later
 * profile values" (port-findings R.1). The wiring around it (reading the URL
 * parameter, fetching the profile) is app code; see the documented recipe.
 *
 * The service is `Subscribable` and marked auto-render (D-L6): a component
 * that injects it re-renders on every culture change without `observe`
 * boilerplate.
 */
import { markAutoRender } from "../di/service-provider.js";
import { CultureInfo } from "./culture-info.js";
import { LocalizationSettings, registerServiceDefault } from "../di/service-defaults.js";

/** What a culture change notification carries (Blazor: an event with no payload). */
export interface CultureChangedEventArgs {
  /** The culture before the change. */
  readonly previous: CultureInfo;
  /** The culture now in effect. */
  readonly current: CultureInfo;
  /** Which setter caused the change: `setExplicit`, `setFromProfile` or `setDefault`. */
  readonly reason: "explicit" | "profile" | "default";
}

/** Normalizes a culture argument for the setters. */
function toCulture(culture: string | CultureInfo): CultureInfo {
  return typeof culture === "string" ? new CultureInfo(culture) : culture;
}

/**
 * The app-wide current culture as a DI service (Blazor/.NET keep it in the
 * ambient `CultureInfo.CurrentCulture`). An explicit selection beats the user
 * profile and locks it out; components that inject the service re-render on
 * every change.
 */
export class CultureService {
  private currentCulture: CultureInfo;
  private defaultCulture: CultureInfo;
  /** An explicit selection locks out profile values (the port's priority rule). */
  private locked = false;
  private readonly handlers = new Set<(event: CultureChangedEventArgs) => void>();

  /** `new CultureService("de-DE")` (or a CultureInfo); without an argument the culture is invariant. */
  constructor(defaultCulture: string | CultureInfo = CultureInfo.invariant) {
    this.defaultCulture = toCulture(defaultCulture);
    this.currentCulture = this.defaultCulture;
    markAutoRender(this);
  }

  /** The current culture (Blazor's CultureInfo.CurrentCulture analogue). */
  get current(): CultureInfo {
    return this.currentCulture;
  }

  /**
   * Explicit selection (URL parameter, host postMessage): wins over everything
   * and locks `setFromProfile` out for the service's lifetime.
   */
  setExplicit(culture: string | CultureInfo): void {
    this.locked = true;
    this.change(toCulture(culture), "explicit");
  }

  /**
   * From the user profile (e.g. the token response). Ignored once an explicit
   * selection was made — returns whether it was applied.
   */
  setFromProfile(culture: string | CultureInfo): boolean {
    if (this.locked) return false;
    this.change(toCulture(culture), "profile");
    return true;
  }

  /** The app default — lowest priority, used until anything else is set. */
  setDefault(culture: string | CultureInfo): void {
    const previous = this.defaultCulture;
    this.defaultCulture = toCulture(culture);
    // A default only applies while nothing stronger was selected: the current
    // culture is still the previous default.
    if (!this.locked && this.currentCulture === previous) this.change(this.defaultCulture, "default");
  }

  /**
   * Culture-change notifications — the source the auto-render observes. A
   * listener is called with the change event (observe's listener shape: called
   * with no interest in return values).
   */
  subscribe(listener: (event: CultureChangedEventArgs) => void): () => void {
    this.handlers.add(listener);
    return () => {
      this.handlers.delete(listener);
    };
  }

  /** Fires only for an actual change: setting the current culture again is a no-op. */
  private change(culture: CultureInfo, reason: CultureChangedEventArgs["reason"]): void {
    if (culture.name === this.currentCulture.name) return;
    const previous = this.currentCulture;
    this.currentCulture = culture;
    const event: CultureChangedEventArgs = { previous, current: culture, reason };
    for (const handler of [...this.handlers]) {
      handler(event);
    }
  }
}

// Every app has a CultureService (invariant unless configured) — registered on first use, so an
// app that never uses one does not bundle it.
registerServiceDefault(CultureService, (services) => new CultureService(services.tryGet(LocalizationSettings)?.defaultCulture ?? ""));

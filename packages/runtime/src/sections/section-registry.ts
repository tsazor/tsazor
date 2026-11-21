import type { RenderFragment } from "../render-tree/render-tree.js";

/** The part of a SectionContent the registry talks to. */
export interface SectionContentLike {
  /** The content the section's outlet renders while this provider is the latest one. */
  childContent?: RenderFragment | undefined;
}

/** The part of a SectionOutlet the registry talks to. */
export interface SectionOutletLike {
  /** Called by the registry with the provider whose content to show now, or `null` when the section has none. */
  contentUpdated(provider: SectionContentLike | null): void;
}

/** Blazor's identifier resolution shared by SectionOutlet/SectionContent. */
export function resolveSectionIdentifier(componentName: string, sectionName: string | null | undefined, sectionId: unknown): unknown {
  if (sectionName != null && sectionId != null) {
    throw new Error(`${componentName} requires that 'SectionName' and 'SectionId' cannot both have non-null values.`);
  }
  if (sectionName != null) return sectionName;
  if (sectionId != null) return sectionId;
  throw new Error(`${componentName} requires a non-null value either for 'SectionName' or 'SectionId'.`);
}

const describe = (identifier: unknown): string =>
  typeof identifier === "string" ? identifier : String(identifier);

/**
 * Blazor's SectionRegistry (one per renderer, reached via the component's
 * render handle): providers per section identifier ("last added wins" — the
 * default-content providers are kept at position 0), exactly ONE subscriber
 * (SectionOutlet) per identifier. Content changes notify the subscriber only
 * when the most recently added provider's content changes or when that latest
 * provider is removed (falling back to the second most recent one).
 *
 * Render-mode-mismatch detection (Blazor's DetectRenderModeMismatch) is not
 * ported: Tsazor has no render modes.
 */
export class SectionRegistry {
  private readonly providersByIdentifier = new Map<unknown, SectionContentLike[]>();
  private readonly subscribersByIdentifier = new Map<unknown, SectionOutletLike>();

  /**
   * Registers a content provider for `identifier`. A default provider goes
   * first, behind all others; any other becomes the latest. Does not notify
   * the outlet — `notifyContentProviderChanged` follows.
   */
  addProvider(identifier: unknown, provider: SectionContentLike, isDefaultProvider: boolean): void {
    let providers = this.providersByIdentifier.get(identifier);
    if (providers === undefined) {
      providers = [];
      this.providersByIdentifier.set(identifier, providers);
    }
    // Blazor: default content comes first, so any later provider wins.
    if (isDefaultProvider) providers.unshift(provider);
    else providers.push(provider);
  }

  /** Unregisters a provider; when it was the latest, the outlet is notified with the next most recent one. Throws when it is not registered. */
  removeProvider(identifier: unknown, provider: SectionContentLike): void {
    const providers = this.providersByIdentifier.get(identifier);
    if (providers === undefined) {
      throw new Error(`There are no content providers with the given section ID '${describe(identifier)}'.`);
    }
    const index = providers.lastIndexOf(provider);
    if (index < 0) {
      throw new Error(`The provider was not found in the providers list of the given section ID '${describe(identifier)}'.`);
    }
    providers.splice(index, 1);
    if (index === providers.length) {
      // We just removed the most recently added provider: the content falls
      // back to the second most recent one (or to nothing).
      this.notifyForSubscriber(identifier, lastProviderOf(providers));
    }
  }

  /** Subscribes the outlet for `identifier` and tells it the current content at once. Throws when the identifier already has an outlet. */
  subscribe(identifier: unknown, outlet: SectionOutletLike): void {
    if (this.subscribersByIdentifier.has(identifier)) {
      throw new Error(`There is already a subscriber to the content with the given section ID '${describe(identifier)}'.`);
    }
    // Blazor subscribes only after the new subscriber has been told the
    // current content, so its first render already shows it.
    outlet.contentUpdated(lastProviderOf(this.providersByIdentifier.get(identifier)));
    this.subscribersByIdentifier.set(identifier, outlet);
  }

  /** Removes the outlet of `identifier`. Throws when there is none. */
  unsubscribe(identifier: unknown): void {
    if (!this.subscribersByIdentifier.delete(identifier)) {
      throw new Error(`The subscriber with the given section ID '${describe(identifier)}' is already unsubscribed.`);
    }
  }

  /** Reports that a provider's content changed; the outlet is notified only when it is the latest provider. Throws when the identifier has no providers. */
  notifyContentProviderChanged(identifier: unknown, provider: SectionContentLike): void {
    const providers = this.providersByIdentifier.get(identifier);
    if (providers === undefined) {
      throw new Error(`There are no content providers with the given section ID '${describe(identifier)}'.`);
    }
    // Content changed notifications go out only for the most recently added
    // provider — older providers' changes are invisible (blotted out).
    if (providers.length !== 0 && providers[providers.length - 1] === provider) {
      this.notifyForSubscriber(identifier, provider);
    }
  }

  private notifyForSubscriber(identifier: unknown, provider: SectionContentLike | null): void {
    const outlet = this.subscribersByIdentifier.get(identifier);
    if (outlet !== undefined) outlet.contentUpdated(provider);
  }
}

function lastProviderOf(providers: SectionContentLike[] | undefined): SectionContentLike | null {
  return providers !== undefined && providers.length !== 0 ? providers[providers.length - 1]! : null;
}
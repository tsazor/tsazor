import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { CascadingValueSupplier } from "../renderer/cascading-value.js";
import type { ServiceProvider } from "../di/service-collection.js";
import { ANONYMOUS, AuthenticationState } from "./authentication-state.js";
import { watchAuthenticationState } from "./authentication-state-provider.js";

/**
 * Blazor's CascadingAuthenticationState: cascades the AuthenticationState to
 * the whole subtree and re-renders it on login/logout. The
 * AuthenticationStateProvider is looked up in DI (registerValue); this
 * wrapper also re-renders children that cascade-consume the state.
 */
export class CascadingAuthenticationState extends ComponentBase implements CascadingValueSupplier {
  /** Content whose subtree receives the AuthenticationState. */
  @Parameter() childContent?: RenderFragment;

  /** Marks the component as a cascading value supplier for the renderer. */
  readonly isCascadingValueSupplier = true;
  readonly isFixed = false;
  /** Cascades by type, unnamed (Blazor cascades its Task<AuthenticationState> the same way). */
  readonly cascadeType = AuthenticationState;
  /** The cascaded AuthenticationState (anonymous until the provider resolves). */
  get cascadeValue(): unknown {
    return this.authenticationState ?? ANONYMOUS;
  }

  private authenticationState?: AuthenticationState;
  private unsubscribe?: () => void;

  protected override onInitialized(): void {
    const services = this.componentServices as ServiceProvider | undefined;
    this.unsubscribe = watchAuthenticationState(services, (state) => {
      this.authenticationState = state;
      this.stateHasChangedInternal();
    });
  }

  /** Stops listening to authentication state changes. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.childContent?.(b);
  }
}
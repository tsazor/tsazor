import { ComponentBase } from "../components/component-base";
import { Parameter } from "../components/parameter-metadata";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree";
import type { CascadingValueSupplier } from "../renderer/cascading-value";
import type { ServiceProvider } from "../di/service-collection";
import { ANONYMOUS, AuthenticationState } from "./authentication-state";
import { watchAuthenticationState } from "./authentication-state-provider";

/**
 * Blazor's CascadingAuthenticationState: cascades the AuthenticationState to
 * the whole subtree and re-renders it on login/logout. The
 * AuthenticationStateProvider is looked up in DI (registerValue); this
 * wrapper also re-renders children that cascade-consume the state.
 */
export class CascadingAuthenticationState extends ComponentBase implements CascadingValueSupplier {
  /** Content whose subtree receives the AuthenticationState. */
  @Parameter() childContent?: RenderFragment;

  readonly isCascadingValueSupplier = true;
  readonly isFixed = false;
  /** Cascades under this name OR by the AuthenticationState type token. */
  readonly cascadeName = "AuthenticationState";
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

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.childContent?.(b);
  }
}
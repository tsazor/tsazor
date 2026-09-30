import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { CascadingValueSupplier } from "../renderer/cascading-value.js";
import type { ServiceProvider } from "../di/service-collection.js";
import { ANONYMOUS, AuthenticationState } from "./authentication-state.js";
import { watchAuthenticationState } from "./authentication-state-provider.js";
import { AuthorizationService, defaultAuthorizationService, type AuthorizationRequirements } from "./authorization.js";

/**
 * Blazor's AuthorizeView: renders authorized/not-authorized content based on
 * the current user. The AuthenticationStateProvider is looked up in DI
 * (register the provider instance via ServiceCollection.registerValue); the
 * state is cascaded to children as `@CascadingParameter({ type: AuthenticationState })`.
 */
export class AuthorizeView extends ComponentBase implements CascadingValueSupplier {
  /** Policy name checked via the AuthorizationService. */
  @Parameter() policy?: string;
  /** Roles that grant access (string array or comma-separated string). */
  @Parameter() roles?: readonly string[] | string;

  /** Authorized content without the state context (Razor's default ChildContent). */
  @Parameter() childContent?: RenderFragment;
  /** Authorized content receiving the AuthenticationState (Razor's <Authorized>). */
  @Parameter() authorized?: (state: AuthenticationState) => RenderFragment;
  /** Rendered when access is denied (Razor's <NotAuthorized>). */
  @Parameter() notAuthorized?: RenderFragment;
  /** Rendered while the state is still resolving (Razor's <Authorizing>). */
  @Parameter() authorizing?: RenderFragment;

  readonly isCascadingValueSupplier = true;
  /** The state changes over time (login/logout) — never fixed. */
  readonly isFixed = false;
  /** Cascades under this name OR by the AuthenticationState type token. */
  readonly cascadeName = "AuthenticationState";
  get cascadeValue(): unknown {
    return this.authenticationState ?? ANONYMOUS;
  }

  private authenticationState?: AuthenticationState;
  private resolved = false;
  private unsubscribe?: () => void;

  protected override onInitialized(): void {
    const services = this.componentServices as ServiceProvider | undefined;
    this.unsubscribe = watchAuthenticationState(services, (state) => {
      this.authenticationState = state;
      this.resolved = true;
      this.stateHasChangedInternal();
    });
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (!this.resolved) {
      // Blazor: nothing renders while the state resolves unless <Authorizing> is set.
      this.authorizing?.(b);
      return;
    }
    const state = this.authenticationState ?? ANONYMOUS;
    if (this.isAuthorized(state)) {
      if (this.authorized) {
        b.addContent(0, this.authorized(state));
      } else if (this.childContent) {
        b.addContent(1, this.childContent);
      }
    } else if (this.notAuthorized) {
      b.addContent(2, this.notAuthorized);
    }
  }

  private isAuthorized(state: AuthenticationState): boolean {
    return this.authorizationService().isAuthorized(state.user, this.requirements());
  }

  private requirements(): AuthorizationRequirements {
    return { roles: this.normalizedRoles(), policy: this.policy };
  }

  private normalizedRoles(): readonly string[] | undefined {
    if (this.roles === undefined) return undefined;
    return typeof this.roles === "string"
      ? this.roles.split(",").map((role) => role.trim()).filter(Boolean)
      : this.roles;
  }

  private authorizationService(): AuthorizationService {
    const services = this.componentServices as ServiceProvider | undefined;
    return services?.tryGet(AuthorizationService) ?? defaultAuthorizationService;
  }
}
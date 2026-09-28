import { ComponentBase } from "../components/component-base";
import { Parameter } from "../components/parameter-metadata";
import { defineComponent } from "../components/component-definition";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree";
import type { ServiceProvider } from "../di/service-collection";
import { renderWithLayout } from "../routing/route-view";
import type { RouteData } from "../routing/route-data";
import { ANONYMOUS, AuthenticationState } from "./authentication-state";
import { watchAuthenticationState } from "./authentication-state-provider";
import { AuthorizationService, defaultAuthorizationService } from "./authorization";

/**
 * Blazor's AuthorizeRouteView: like RouteView, but the matched page only
 * renders when the user meets the route's `authorize` requirements
 * (Blazor's [Authorize] attribute on the page). Swap it into the Router's
 * found fragment to protect pages.
 */
export class AuthorizeRouteView extends ComponentBase {
  /** The RouteData the Router's found fragment passed in. */
  @Parameter() routeData!: RouteData;
  /** Fallback layout when the page has no @layout. */
  @Parameter() defaultLayout?: abstract new (...args: never[]) => ComponentBase;
  /** Renders the page when access is granted (Razor's <Authorized>). */
  @Parameter() authorized?: (state: AuthenticationState) => RenderFragment;
  /** Rendered when access is denied (Razor's <NotAuthorized>). */
  @Parameter() notAuthorized?: RenderFragment;
  /** Rendered while the state is still resolving (Razor's <Authorizing>). */
  @Parameter() authorizing?: RenderFragment;

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
      this.authorizing?.(b);
      return;
    }
    const state = this.authenticationState ?? ANONYMOUS;
    const requirements = this.routeData.route.authorize;
    // No requirements on the entry → public page (render for anyone).
    if (requirements && !this.authorizationService().isAuthorized(state.user, requirements)) {
      if (this.notAuthorized) b.addContent(0, this.notAuthorized);
      return;
    }
    if (this.authorized) {
      b.addContent(1, this.authorized(state));
      return;
    }
    // Default: render the page inside its layout (RouteView's job).
    const page = this.routeData.route.type as abstract new (...args: never[]) => ComponentBase;
    const layout = (this.routeData.route.layout ?? this.defaultLayout) as
      | (abstract new (...args: never[]) => ComponentBase)
      | undefined;

    const pageFragment: RenderFragment = (inner) => {
      inner.openComponent(0, defineComponent(page));
      let sequence = 1;
      for (const [name, value] of Object.entries(this.routeData.values)) {
        inner.addAttribute(sequence++, name, value);
      }
      inner.closeComponent();
    };

    if (layout) {
      renderWithLayout(b, layout, pageFragment);
    } else {
      b.addContent(2, pageFragment);
    }
  }

  private authorizationService(): AuthorizationService {
    const services = this.componentServices as ServiceProvider | undefined;
    return services?.tryGet(AuthorizationService) ?? defaultAuthorizationService;
  }
}
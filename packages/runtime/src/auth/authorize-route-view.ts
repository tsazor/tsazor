import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { ServiceProvider } from "../di/service-collection.js";
import { RouteView } from "../routing/route-view.js";
import { ANONYMOUS, AuthenticationState } from "./authentication-state.js";
import { watchAuthenticationState } from "./authentication-state-provider.js";
import { AuthorizationService, defaultAuthorizationService } from "./authorization.js";

/**
 * Blazor's AuthorizeRouteView: like RouteView, but the matched page only
 * renders when the user meets the route's `authorize` requirements
 * (Blazor's [Authorize] attribute on the page). Swap it into the Router's
 * found fragment to protect pages. As in Blazor it derives from RouteView,
 * which renders the granted page (layout, route and query parameters).
 */
export class AuthorizeRouteView extends RouteView {
  /** Renders the page when access is granted (Razor's <Authorized>). */
  @Parameter() authorized?: (state: AuthenticationState) => RenderFragment;
  /** Rendered when access is denied; receives the AuthenticationState
   *  (Razor's <NotAuthorized>, Blazor's RenderFragment<AuthenticationState>). */
  @Parameter() notAuthorized?: (state: AuthenticationState) => RenderFragment;
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

  /** Stops listening to authentication state changes. */
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
      if (this.notAuthorized) b.addContent(10, this.notAuthorized(state));
      return;
    }
    if (this.authorized) {
      b.addContent(11, this.authorized(state));
      return;
    }
    // Default: the page inside its layout, as RouteView renders it.
    super.buildRenderTree(b);
  }

  private authorizationService(): AuthorizationService {
    const services = this.componentServices as ServiceProvider | undefined;
    return services?.tryGet(AuthorizationService) ?? defaultAuthorizationService;
  }
}
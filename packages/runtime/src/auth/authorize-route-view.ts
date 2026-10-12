import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { ServiceProvider } from "../di/service-collection.js";
import { renderWithLayout, RouteView } from "../routing/route-view.js";
import { ANONYMOUS, AuthenticationState } from "./authentication-state.js";
import { watchAuthenticationState } from "./authentication-state-provider.js";
import { AuthorizationService, defaultAuthorizationService } from "./authorization.js";

/**
 * Blazor's AuthorizeRouteView: like RouteView, but the matched page only
 * renders when the user meets the route's `authorize` requirements
 * (Blazor's [Authorize] attribute on the page). Swap it into the Router's
 * found fragment to protect pages. As in Blazor it derives from RouteView,
 * which renders the granted page (layout, route and query parameters), and
 * renders NotAuthorized and Authorizing in the default layout too — "Not
 * authorized" and "Authorizing..." when the app gives none.
 */
export class AuthorizeRouteView extends RouteView {
  /** Renders the page when access is granted (Razor's <Authorized>). */
  @Parameter() authorized?: (state: AuthenticationState) => RenderFragment;
  /** Rendered in the default layout when access is denied; receives the AuthenticationState
   *  (Razor's <NotAuthorized>, Blazor's RenderFragment<AuthenticationState>). */
  @Parameter() notAuthorized?: (state: AuthenticationState) => RenderFragment;
  /** Rendered in the default layout while the state is still resolving (Razor's <Authorizing>). */
  @Parameter() authorizing?: RenderFragment;

  private authenticationState?: AuthenticationState;
  private resolved = false;
  private unsubscribe?: () => void;

  protected override onInitialized(): void {
    const services = this.componentServices as ServiceProvider | undefined;
    this.unsubscribe = watchAuthenticationState(
      services,
      (state) => {
        this.authenticationState = state;
        this.resolved = true;
        this.stateHasChangedInternal();
      },
      () => {
        // A promise was notified: Authorizing until it resolves, as Blazor awaits the Task.
        this.resolved = false;
        this.stateHasChangedInternal();
      },
    );
  }

  /** Stops listening to authentication state changes. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (!this.resolved) {
      this.renderInDefaultLayout(b, this.authorizing ?? defaultAuthorizing);
      return;
    }
    const state = this.authenticationState ?? ANONYMOUS;
    const requirements = this.routeData.route.authorize;
    // No requirements on the entry → public page (render for anyone).
    if (requirements && !this.authorizationService().isAuthorized(state.user, requirements)) {
      this.renderInDefaultLayout(b, (this.notAuthorized ?? defaultNotAuthorized)(state));
      return;
    }
    if (this.authorized) {
      b.addContent(11, this.authorized(state));
      return;
    }
    // Default: the page inside its layout, as RouteView renders it.
    super.buildRenderTree(b);
  }

  /**
   * Blazor's RenderContentInDefaultLayout: NotAuthorized and Authorizing sit in the app's frame too. The layout is
   * where the granted page's would be, so it stays when access turns granted (a sign-in).
   */
  private renderInDefaultLayout(b: RenderTreeBuilder, content: RenderFragment): void {
    if (this.defaultLayout) renderWithLayout(b, this.defaultLayout, content);
    else b.addContent(0, content);
  }

  private authorizationService(): AuthorizationService {
    const services = this.componentServices as ServiceProvider | undefined;
    return services?.tryGet(AuthorizationService) ?? defaultAuthorizationService;
  }
}

/** Blazor's defaults when the app gives no NotAuthorized or Authorizing content. */
const defaultNotAuthorized = (): RenderFragment => (b) => b.addContent(0, "Not authorized");
const defaultAuthorizing: RenderFragment = (b) => b.addContent(0, "Authorizing...");
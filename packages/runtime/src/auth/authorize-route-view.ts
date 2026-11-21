import { componentInternals } from "../components/component-internals.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { ServiceProvider, Token } from "../di/service-collection.js";
import { renderWithLayout, RouteView } from "../routing/route-view.js";
import { ANONYMOUS, AuthenticationState } from "./authentication-state.js";
import { watchAuthenticationState } from "./authentication-state-provider.js";
import { AuthorizationDecision, AuthorizationService, defaultAuthorizationService } from "./authorization.js";
import { StringLocalizer } from "../localization/string-localizer.js";

/**
 * Blazor's AuthorizeRouteView: like RouteView, but the matched page only
 * renders when the user meets the route's `authorize` requirements
 * (Blazor's [Authorize] attribute on the page). Swap it into the Router's
 * found fragment to protect pages. As in Blazor it derives from RouteView,
 * which renders the granted page (layout, route and query parameters), and
 * renders NotAuthorized and Authorizing in the default layout too — "Not
 * authorized" and "Authorizing..." when the app gives none. A registered
 * StringLocalizer translates those two by the reserved keys
 * `tsazor.auth.notAuthorized` and `tsazor.auth.authorizing`.
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
  readonly #decision = new AuthorizationDecision();
  private unsubscribe?: () => void;
  private unsubscribeLocalizer?: () => void;
  private localizer?: StringLocalizer;

  protected override onInitialized(): void {
    const services = componentInternals.services(this) as ServiceProvider | undefined;
    // The default texts in the app's language; tryGet: without a localizer they stay English.
    this.localizer = services?.tryGet(StringLocalizer as unknown as Token<StringLocalizer>);
    this.unsubscribeLocalizer = this.localizer?.subscribe(() => componentInternals.requestRender(this));
    this.unsubscribe = watchAuthenticationState(
      services,
      (state) => {
        this.authenticationState = state;
        this.resolved = true;
        componentInternals.requestRender(this);
      },
      () => {
        // A promise was notified: Authorizing until it resolves, as Blazor awaits the Task.
        this.resolved = false;
        componentInternals.requestRender(this);
      },
    );
  }

  /** Stops listening to authentication state changes. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeLocalizer?.();
    this.unsubscribeLocalizer = undefined;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (!this.resolved) {
      this.renderInDefaultLayout(b, this.authorizing ?? this.text("authorizing", "Authorizing..."));
      return;
    }
    const state = this.authenticationState ?? ANONYMOUS;
    const requirements = this.routeData.route.authorize;
    // No requirements on the entry → public page (render for anyone).
    if (requirements) {
      const authorized = this.#decision.decide(
        this.authorizationService(),
        state.user,
        requirements,
        () => componentInternals.requestRender(this),
        (error) => componentInternals.reportError(this, error, "lifecycle"),
      );
      if (authorized === undefined) {
        // An async policy is deciding: Authorizing, as Blazor awaits AuthorizeAsync.
        this.renderInDefaultLayout(b, this.authorizing ?? this.text("authorizing", "Authorizing..."));
        return;
      }
      if (!authorized) {
        this.renderInDefaultLayout(b, this.notAuthorized?.(state) ?? this.text("notAuthorized", "Not authorized"));
        return;
      }
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

  /** Blazor's default text when the app gives no content, translated by `tsazor.auth.<name>` when it can be. */
  private text(name: "notAuthorized" | "authorizing", english: string): RenderFragment {
    const text = this.localizer?.raw(`tsazor.auth.${name}`) ?? english;
    return (b) => b.addContent(0, text);
  }

  private authorizationService(): AuthorizationService {
    const services = componentInternals.services(this) as ServiceProvider | undefined;
    return services?.tryGet(AuthorizationService) ?? defaultAuthorizationService;
  }
}

import { ComponentBase } from "../components/component-base.js";
import { EventCallback } from "../components/event-callback.js";
import { Parameter } from "../components/parameter-metadata.js";
import { NavigationManager, type LocationChangingContext } from "../navigation/navigation-manager.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";

/**
 * Blazor's NavigationLock: while rendered, `onBeforeInternalNavigation` runs
 * before every internal navigation (programmatic, intercepted link click,
 * back/forward) and may call `context.preventNavigation()`;
 * `confirmExternalNavigation` asks the browser to confirm leaving the app
 * (beforeunload). Renders nothing.
 */
export class NavigationLock extends ComponentBase {
  /** Runs before each internal navigation; call `context.preventNavigation()` to cancel it. */
  @Parameter() onBeforeInternalNavigation?: EventCallback<LocationChangingContext> | ((context: LocationChangingContext) => void | Promise<void>);
  /** Asks the browser to confirm leaving the app (reload, close, external link) while rendered. */
  @Parameter() confirmExternalNavigation = false;

  private readonly navigation = this.inject(NavigationManager);
  private registration?: { dispose(): void };
  private beforeUnloadInstalled = false;
  /** Per instance, so one lock's removal does not drop another's listener. */
  private readonly onBeforeUnload = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
    // Legacy browsers need returnValue set to show the prompt.
    event.returnValue = true as unknown as string;
  };

  protected override onAfterRender(): void {
    const hasHandler = this.onBeforeInternalNavigation !== undefined;
    if (hasHandler && !this.registration) {
      this.registration = this.navigation.registerLocationChangingHandler((context) => this.invokeHandler(context));
    } else if (!hasHandler && this.registration) {
      this.registration.dispose();
      this.registration = undefined;
    }
    if (typeof window === "undefined") return;
    if (this.confirmExternalNavigation && !this.beforeUnloadInstalled) {
      window.addEventListener("beforeunload", this.onBeforeUnload);
      this.beforeUnloadInstalled = true;
    } else if (!this.confirmExternalNavigation && this.beforeUnloadInstalled) {
      window.removeEventListener("beforeunload", this.onBeforeUnload);
      this.beforeUnloadInstalled = false;
    }
  }

  private async invokeHandler(context: LocationChangingContext): Promise<void> {
    const handler = this.onBeforeInternalNavigation;
    if (handler instanceof EventCallback) {
      await handler.invokeAsync(context);
    } else if (handler) {
      await handler(context);
    }
  }

  protected override buildRenderTree(_b: RenderTreeBuilder): void {}

  dispose(): void {
    this.registration?.dispose();
    this.registration = undefined;
    if (this.beforeUnloadInstalled) {
      window.removeEventListener("beforeunload", this.onBeforeUnload);
      this.beforeUnloadInstalled = false;
    }
  }
}

/**
 * Overlay (Fluent UI Blazor's FluentOverlay, MudBlazor's MudOverlay): a busy state over its container or the page,
 * a Spinner by default, the close modes, `@bind-Visible`, show() and close(), and the background's color.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Overlay } from "../dist/index.js";

const PREFIX = "tz";

const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

interface OverlayRef {
  show(): Promise<void>;
  close(): Promise<void>;
}

/** A card with a field and an overlay over it, its `visible` bound like `@bind-Visible`. */
async function mount(attrs: Record<string, unknown> = {}, visible = true, content?: string) {
  class Host extends ComponentBase {
    static last: Host | undefined;
    visible = visible;
    changes: boolean[] = [];
    overlay?: OverlayRef;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openElement(0, "section");
      b.addAttribute(1, "style", "position: relative");
      b.openElement(2, "input");
      b.addAttribute(3, "id", "field");
      b.closeElement();
      b.openComponent(4, Overlay);
      b.addAttribute(5, "visible", this.visible);
      b.addAttribute(6, "visibleChanged", EventCallback.bind(this, (value: boolean) => {
        this.visible = value;
        this.changes.push(value);
      }));
      let seq = 7;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      if (content !== undefined) b.addAttribute(30, "childContent", (c: RenderTreeBuilder) => {
        c.openElement(0, "button");
        c.addContent(1, content);
        c.closeElement();
      });
      b.addComponentReferenceCapture(31, (component) => {
        this.overlay = component as unknown as OverlayRef;
      });
      b.closeComponent();
      b.closeElement();
    }
    /** The parent sets `visible` and renders. */
    async set(value: boolean): Promise<void> {
      this.visible = value;
      this.stateHasChanged();
    }
  }
  const result = await render(Host);
  hosts.push(result);
  await result.settle();
  const host = Host.last!;
  return {
    host,
    container: result.container,
    overlay: () => result.container.querySelector<HTMLElement>(`.${PREFIX}-overlay`),
    field: () => result.container.querySelector<HTMLInputElement>("#field")!,
    settle: async () => {
      await result.settle();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await result.settle();
    },
  };
}

const escape = () => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

describe("Overlay", () => {
  it("covers its container with a Spinner, and makes the rest of it inert", async () => {
    const { overlay, field } = await mount();
    expect(overlay()!.className).toBe(`${PREFIX}-overlay`);
    expect(overlay()!.querySelector("[role=status] .spinner-border")).not.toBeNull();
    expect(overlay()!.hasAttribute("role")).toBe(false);
    expect(overlay()!.getAttribute("style")).toBe("--tz-overlay-background: color-mix(in srgb, var(--bs-body-bg) 40%, transparent)");
    expect(field().hasAttribute("inert")).toBe(true);
  });

  it("renders nothing while not visible", async () => {
    const { overlay, field } = await mount({}, false);
    expect(overlay()).toBeNull();
    expect(field().hasAttribute("inert")).toBe(false);
  });

  it("full screen: a named modal dialog over the page", async () => {
    const { overlay } = await mount({ fullScreen: true });
    expect(overlay()!.className).toBe(`${PREFIX}-overlay ${PREFIX}-overlay--full-screen`);
    expect(overlay()!.getAttribute("role")).toBe("dialog");
    expect(overlay()!.getAttribute("aria-modal")).toBe("true");
    expect(overlay()!.getAttribute("aria-label")).toBe("Loading…");
    expect(document.activeElement).toBe(overlay());
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("full screen with content: focus goes to its first control, and ariaLabel names it", async () => {
    const { overlay } = await mount({ fullScreen: true, ariaLabel: "Saving" }, true, "Cancel");
    expect(overlay()!.getAttribute("aria-label")).toBe("Saving");
    expect(document.activeElement?.textContent).toBe("Cancel");
  });

  it("closes on a click anywhere by default, and tells the parent", async () => {
    const { host, overlay, field, settle } = await mount();
    overlay()!.click();
    await settle();
    expect(host.changes).toEqual([false]);
    expect(overlay()).toBeNull();
    expect(field().hasAttribute("inert")).toBe(false);
  });

  it("closeMode outside: a click on the content keeps it, one on the background closes it", async () => {
    const { host, overlay, settle } = await mount({ closeMode: "outside" });
    overlay()!.querySelector<HTMLElement>("[role=status]")!.click();
    await settle();
    expect(host.changes).toEqual([]);
    overlay()!.click();
    await settle();
    expect(host.changes).toEqual([false]);
  });

  it("closeMode manual: neither clicks nor Escape close it; show() and close() do", async () => {
    const { host, overlay, settle } = await mount({ fullScreen: true, closeMode: "manual" });
    overlay()!.click();
    escape();
    await settle();
    expect(overlay()).not.toBeNull();
    await host.overlay!.closeAsync();
    await settle();
    expect(overlay()).toBeNull();
    await host.overlay!.showAsync();
    await settle();
    expect(overlay()).not.toBeNull();
    expect(host.changes).toEqual([false, true]);
  });

  it("Escape closes a full-screen overlay", async () => {
    const { host, settle } = await mount({ fullScreen: true });
    escape();
    await settle();
    expect(host.changes).toEqual([false]);
    expect(document.body.style.overflow).toBe("");
  });

  it("interactive: blocks nothing", async () => {
    const { overlay, field } = await mount({ interactive: true });
    expect(overlay()!.className).toBe(`${PREFIX}-overlay ${PREFIX}-overlay--interactive`);
    expect(field().hasAttribute("inert")).toBe(false);
  });

  it("takes the background's color and opacity, and adds the caller's style and class", async () => {
    const { overlay } = await mount({ backgroundColor: "#fff", opacity: 70, style: "z-index: 5", class: "busy" });
    expect(overlay()!.getAttribute("style")).toBe("--tz-overlay-background: color-mix(in srgb, #fff 70%, transparent); z-index: 5");
    expect(overlay()!.className).toBe(`${PREFIX}-overlay busy`);
  });

  it("follows the parent's visible", async () => {
    const { host, overlay, settle } = await mount({}, false);
    await host.set(true);
    await settle();
    expect(overlay()).not.toBeNull();
    await host.set(false);
    await settle();
    expect(overlay()).toBeNull();
  });
});

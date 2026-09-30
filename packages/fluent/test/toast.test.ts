/**
 * Toast + ToastProvider tests: cascade-accessed show(), severity classes,
 * status/alert role semantics, close button and auto-dismiss.
 */
import { afterAll, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import {
  CascadingParameter,
  ComponentBase,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { ToastProvider, Toast } from "../dist/index.js";

/** The renderer type returned by render. */
type Renderer = Awaited<ReturnType<typeof render>>["renderer"];

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

/** A component inside the provider that grabs the FluentToasts cascade. */
class ToastUser extends ComponentBase {
  static current?: ToastUser;

  @CascadingParameter({ name: "FluentToasts" })
  host?: { show(options: { title?: string; message?: string; severity?: string; timeout?: number }): number };

  protected override onInitialized(): void {
    ToastUser.current = this;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "div");
    b.addAttribute(1, "class", "toast-user");
    b.closeElement();
  }
}

/** Host: ToastProvider with one ToastUser child (cascade consumer). */
class ProviderHost extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, ToastProvider);
    b.addAttribute(
      1,
      "childContent",
      (c: RenderTreeBuilder) => {
        c.openComponent(0, ToastUser);
        c.closeComponent();
      },
    );
    b.closeComponent();
  }
}

/** Renders the provider host and returns the cascaded provider handle. */
async function renderToasts(): Promise<{
  result: RenderResult;
  show: (options?: { title?: string; message?: string; severity?: string; timeout?: number }) => void;
}> {
  const result = await render(ProviderHost);
  await settle(result.renderer);
  const user = ToastUser.current!;
  const host = user.host!;
  return { result, show: (o) => { host.show(o ?? {}); } };
}

afterAll(() => {
  document.body.innerHTML = "";
  ToastUser.current = undefined;
});

async function settleResult(result: RenderResult): Promise<void> {
  await result.rerender();
  await settle(result.renderer);
}

describe("Toast + ToastProvider", () => {
  it("renders an aria-live region and shows a toast with severity class", async () => {
    const { result, show } = await renderToasts();
    expect(result.container.querySelector(".fui-toasts")!.getAttribute("aria-live")).toBe("polite");

    show({ title: "Saved", message: "Order stored.", severity: "success", timeout: 0 });
    await settleResult(result);

    const toast = result.container.querySelector(".fui-toast")!;
    expect(toast.className).toContain("fui-toast--success");
    expect(toast.getAttribute("role")).toBe("status");
    expect(result.container.querySelector(".fui-toast__title")!.textContent).toBe("Saved");
    expect(result.container.querySelector(".fui-toast__message")!.textContent).toBe("Order stored.");
    result.dispose();
  });

  it("uses role=alert for error toasts", async () => {
    const { result, show } = await renderToasts();
    show({ title: "Failed", severity: "error", timeout: 0 });
    await settleResult(result);
    expect(result.container.querySelector(".fui-toast")!.getAttribute("role")).toBe("alert");
    result.dispose();
  });

  it("dismisses via the close button", async () => {
    const { result, show } = await renderToasts();
    show({ title: "Note", timeout: 0 });
    await settleResult(result);
    expect(result.container.querySelector(".fui-toast")).not.toBeNull();

    result.container.querySelector(".fui-toast__close")!.dispatchEvent(new Event("click", { bubbles: true }));
    await settleResult(result);
    expect(result.container.querySelector(".fui-toast")).toBeNull();
    result.dispose();
  });

  it("auto-dismisses after the timeout fires", async () => {
    const { result, show } = await renderToasts();
    show({ title: "Gone soon", timeout: 5 });
    await settleResult(result);
    expect(result.container.querySelector(".fui-toast")).not.toBeNull();

    // Let the real timer fire, then flush the scheduled re-render.
    await new Promise((resolve) => setTimeout(resolve, 30));
    await settleResult(result);
    expect(result.container.querySelector(".fui-toast")).toBeNull();
    result.dispose();
  });

  it("renders the sticky Toast component standalone with severity roles", async () => {
    const { container } = await renderToast();
    const toast = container.querySelector(".fui-toast")!;
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.className).toBe("fui-toast fui-toast--info");
    expect(container.querySelector(".fui-toast__close")).not.toBeNull();
  });
});

import { renderTree } from "@tsazor/testing";

async function renderToast(): Promise<RenderResult> {
  const result = await renderTree(b => {
    b.openComponent(0, Toast);
    b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Saved."));
    b.closeComponent();
  });
  await settle(result.renderer);
  return result;
}
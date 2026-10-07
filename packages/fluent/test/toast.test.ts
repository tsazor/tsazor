/**
 * ToastRegion + Toaster (the shared toast service of @tsazor/ui) and the
 * standalone Toast: intent classes, status/alert roles, close button,
 * auto-dismiss and the pause while the pointer is over a toast.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTree } from "@tsazor/testing";
import { ToastRegion, Toaster, Toast } from "../dist/index.js";

type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];

async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

async function renderRegion(toaster: Toaster, position?: string) {
  return renderTree(
    (b) => {
      b.openComponent(0, ToastRegion);
      if (position) b.addAttribute(1, "position", position);
      b.closeComponent();
    },
    { services: (services) => services.registerValue(Toaster, toaster) },
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastRegion", () => {
  it("shows the Toaster's toasts in a polite live region, colored by intent", async () => {
    const toaster = new Toaster();
    const { container, renderer } = await renderRegion(toaster);
    toaster.show({ title: "Saved", message: "Order 101", intent: "success", timeout: 0 });
    toaster.show({ message: "Offline", intent: "danger", timeout: 0 });
    toaster.show({ message: "Synced", intent: "primary", timeout: 0 });
    await settle(renderer);
    const region = container.querySelector(".fui-toasts")!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    const toasts = [...container.querySelectorAll<HTMLElement>(".fui-toast")];
    expect(toasts.map((toast) => toast.className)).toEqual(["fui-toast fui-toast--success", "fui-toast fui-toast--danger", "fui-toast fui-toast--info"]);
    expect(toasts[0]!.querySelector(".fui-toast__title")!.textContent).toBe("Saved");
    expect(toasts[1]!.getAttribute("role")).toBe("alert");
    expect(toasts[0]!.hasAttribute("role")).toBe(false);
  });

  it("closes a toast with its button", async () => {
    const toaster = new Toaster();
    const { container, renderer } = await renderRegion(toaster);
    toaster.show({ message: "One", timeout: 0 });
    toaster.show({ message: "Two", timeout: 0 });
    await settle(renderer);
    container.querySelector<HTMLElement>(".fui-toast__close")!.click();
    await settle(renderer);
    expect(toaster.toasts.map((toast) => toast.message)).toEqual(["Two"]);
    expect(container.querySelectorAll(".fui-toast")).toHaveLength(1);
  });

  it("closes a toast after its timeout, but not while the pointer is over it", async () => {
    vi.useFakeTimers();
    const toaster = new Toaster();
    const { container, renderer } = await renderRegion(toaster);
    toaster.show({ message: "Saved", timeout: 1000 });
    await renderer.waitUntilIdle();
    const toast = container.querySelector<HTMLElement>(".fui-toast")!;
    toast.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(5000);
    expect(toaster.toasts).toHaveLength(1);
    toast.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(1000);
    await renderer.waitUntilIdle();
    expect(toaster.toasts).toHaveLength(0);
    expect(container.querySelectorAll(".fui-toast")).toHaveLength(0);
  });

  it("sits in the corner given by position", async () => {
    const toaster = new Toaster();
    const { container } = await renderRegion(toaster, "top-start");
    expect(container.querySelector(".fui-toasts")!.className).toBe("fui-toasts fui-toasts--top fui-toasts--start");
  });
});

describe("Toast", () => {
  it("renders one toast with its intent and role", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Toast);
      b.addAttribute(1, "intent", "danger");
      b.addAttribute(2, "title", "Payment failed");
      b.closeComponent();
    });
    const toast = container.querySelector(".fui-toast")!;
    expect(toast.className).toBe("fui-toast fui-toast--danger");
    expect(toast.getAttribute("role")).toBe("alert");
  });
});

/** The Bootstrap skin's Toast takes the Fluent skin's parameters (S1): intent, title, content, dismissible, onDismissed. */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Toast, ToastRegion, Toaster } from "../dist/index.js";

async function settle(renderer: { settle(): Promise<void> }): Promise<void> {
  await renderer.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.settle();
}

async function renderRegion(toaster: Toaster) {
  return renderTree(
    (b) => {
      b.openComponent(0, ToastRegion);
      b.closeComponent();
    },
    { services: (services) => services.registerValue(Toaster, toaster) },
  );
}

describe("ToastRegion", () => {
  it("closing the toast that holds the focus moves it to the next toast, then back where it came from", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    const toaster = new Toaster();
    const { container, ...renderer } = await renderRegion(toaster);
    toaster.show({ message: "One", timeout: 0 });
    toaster.show({ message: "Two", timeout: 0 });
    await settle(renderer);
    opener.focus();
    const closes = () => [...container.querySelectorAll<HTMLButtonElement>(".btn-close")];
    closes()[0]!.focus();
    closes()[0]!.click();
    await settle(renderer);
    expect(document.activeElement).toBe(closes()[0]);
    closes()[0]!.click();
    await settle(renderer);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("Toast", () => {
  it("renders one toast with its intent and role, title and message", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Toast);
      b.addAttribute(1, "intent", "danger");
      b.addAttribute(2, "title", "Payment failed");
      b.addAttribute(3, "childContent", (inner: RenderTreeBuilder) => inner.addContent(0, "Try another card."));
      b.closeComponent();
    });
    const toast = container.querySelector(".toast")!;
    expect(toast.className).toBe("toast show align-items-center border-0 text-bg-danger");
    expect(toast.getAttribute("role")).toBe("alert");
    // An aria-live of its own would override the alert's assertive politeness.
    expect(toast.hasAttribute("aria-live")).toBe(false);
    expect(toast.getAttribute("data-bs-theme")).toBe("dark");
    expect(toast.querySelector("strong")!.textContent).toBe("Payment failed");
    expect(toast.querySelector(".toast-body")!.textContent).toContain("Try another card.");
  });

  it("is a status by default, and its close button raises onDismissed", async () => {
    const closed: MouseEvent[] = [];
    const { container } = await renderTree((b) => {
      b.openComponent(0, Toast);
      b.addAttribute(1, "onDismissed", EventCallback.bind({}, (e: MouseEvent) => {
        closed.push(e);
      }));
      b.closeComponent();
    });
    const toast = container.querySelector(".toast")!;
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.className).toContain("text-bg-info");
    toast.querySelector<HTMLButtonElement>(".btn-close")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toHaveLength(1);
  });

  it("has no close button when it isn't dismissible", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Toast);
      b.addAttribute(1, "dismissible", false);
      b.closeComponent();
    });
    expect(container.querySelector(".btn-close")).toBeNull();
  });
});

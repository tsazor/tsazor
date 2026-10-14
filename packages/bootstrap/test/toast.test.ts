/** The Bootstrap skin's Toast takes the Fluent skin's parameters (S1): intent, title, content, dismissible, onDismissed. */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Toast } from "../dist/index.js";

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

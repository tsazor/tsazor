/**
 * Dialog behavior tests through the compiled dist pipeline: open/close,
 * Escape, focus trap, backdrop discrimination and nested scroll locking.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  render,
  renderTree,
  type RenderResult,
} from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Button, Dialog } from "../dist/index.js";

/** The renderer type returned by renderTree. */
type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

/** A stateful host that owns the dialog's isOpen flag (parent-driven close). */
class DialogHost extends ComponentBase {
  open = true;
  closes = 0;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, Dialog);
    b.addAttribute(1, "isOpen", this.open);
    b.addAttribute(2, "title", "Confirm order");
    b.addAttribute(3, "id", "confirm-dialog");
    b.addAttribute(
      4,
      "onClosed",
      EventCallback.bind(this, () => {
        this.closes++;
        this.open = false;
        this.stateHasChanged();
      }),
    );
    b.addAttribute(
      5,
      "footer",
      (f: RenderTreeBuilder) => {
        f.openComponent(0, Button);
        f.addAttribute(1, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "First"));
        f.closeComponent();
        f.openComponent(2, Button);
        f.addAttribute(3, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Second"));
        f.closeComponent();
      },
    );
    b.addAttribute(6, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Ship it?"));
    b.closeComponent();
  }
}

/** Renders the DialogHost root. */
async function renderHost(): Promise<RenderResult<DialogHost>> {
  const result = await render(DialogHost);
  await settle(result.renderer);
  return result;
}

/** A dialog with two footer buttons (for focus-trap assertions). */
async function renderDialog(): Promise<RenderResult> {
  const result = await renderTree(b => {
    b.openComponent(0, Dialog);
    b.addAttribute(1, "isOpen", true);
    b.addAttribute(2, "title", "Confirm order");
    b.addAttribute(
      3,
      "footer",
      (f: RenderTreeBuilder) => {
        f.openComponent(0, Button);
        f.addAttribute(1, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "First"));
        f.closeComponent();
        f.openComponent(2, Button);
        f.addAttribute(3, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Second"));
        f.closeComponent();
      },
    );
    b.addAttribute(4, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Ship it?"));
    b.closeComponent();
  });
  await settle(result.renderer);
  return result;
}

beforeAll(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

afterAll(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("Dialog", () => {
  it("renders role=dialog with header/body/footer and takes focus on open", async () => {
    const result = await renderDialog();
    const container = result.container;
    const overlay = container.querySelector(".fui-dialog-overlay")!;
    expect(overlay).toBeTruthy();
    const dialog = container.querySelector(".fui-dialog")!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(container.querySelector(".fui-dialog__title")!.textContent).toBe("Confirm order");
    expect(container.querySelector(".fui-dialog__body")!.textContent).toBe("Ship it?");
    expect([...container.querySelectorAll(".fui-dialog__footer .fui-button")].map(b => b.textContent)).toEqual(["First", "Second"]);
    expect(container.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    result.dispose();
  });

  it("takes Bootstrap's sizes: medium is the plain dialog, the others add their class", async () => {
    const classes: string[] = [];
    for (const size of ["small", "medium", "large", "xlarge"]) {
      const result = await renderTree((b) => {
        b.openComponent(0, Dialog);
        b.addAttribute(1, "isOpen", true);
        b.addAttribute(2, "size", size);
        b.addAttribute(3, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "x"));
        b.closeComponent();
      });
      await settle(result.renderer);
      classes.push(result.container.querySelector("[role=dialog]")!.className);
      result.dispose();
    }
    expect(classes).toEqual(["fui-dialog fui-dialog--small", "fui-dialog", "fui-dialog fui-dialog--large", "fui-dialog fui-dialog--xlarge"]);
  });

  it("closes via Escape and restores body scroll + previously focused element", async () => {
    const sentinel = document.createElement("button");
    document.body.appendChild(sentinel);
    sentinel.focus();

    const result = await renderHost();
    expect(result.instance.closes).toBe(0);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(result.renderer);

    expect(result.instance.closes).toBe(1);
    expect(result.container.querySelector(".fui-dialog-overlay")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.activeElement).toBe(sentinel);
    sentinel.remove();
    result.dispose();
  });

  it("traps Tab: from the last focusable, focus wraps to the first", async () => {
    const result = await renderDialog();
    const container = result.container;
    const buttons = [...container.querySelectorAll("button")];
    const last = buttons[buttons.length - 1]!;
    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]!);
    result.dispose();
  });

  it("traps Shift+Tab: from the first focusable, focus wraps to the last", async () => {
    const result = await renderDialog();
    const container = result.container;
    const close = container.querySelector<HTMLElement>(".fui-dialog__close")!;
    const buttons = [...container.querySelectorAll("button")];
    close.focus();
    close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(buttons[buttons.length - 1]!);
    result.dispose();
  });

  it("closes on a press on the backdrop but not inside the dialog", async () => {
    const result = await renderHost();

    result.container.querySelector(".fui-dialog__body")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await settle(result.renderer);
    expect(result.instance.closes).toBe(0);

    result.container.querySelector(".fui-dialog-overlay")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await settle(result.renderer);
    expect(result.instance.closes).toBe(1);
    expect(result.container.querySelector(".fui-dialog-overlay")).toBeNull();
    result.dispose();
  });

  it("keeps body scroll locked until every open dialog unmounts", async () => {
    document.body.style.overflow = "auto";
    const result = await renderHost();
    expect(document.body.style.overflow).toBe("hidden");

    // A second open dialog (separate root) drives the lock depth to 2.
    const nested = await renderTree(b => {
      b.openComponent(0, Dialog);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "nested"));
      b.closeComponent();
    });
    await settle(nested.renderer);
    expect(document.body.style.overflow).toBe("hidden");

    // Escape belongs to the top dialog (the nested one) only: the host stays open.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(result.renderer);
    expect(result.instance.closes).toBe(0);

    // Removing the nested dialog leaves the host holding the lock.
    nested.dispose();
    expect(document.body.style.overflow).toBe("hidden");

    // Now Escape closes the host, and the original overflow comes back.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(result.renderer);
    expect(result.instance.closes).toBe(1);
    expect(result.container.querySelector(".fui-dialog-overlay")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    result.dispose();
  });
});
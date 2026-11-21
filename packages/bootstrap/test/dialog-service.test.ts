/**
 * DialogService + DialogProvider + a hosted Dialog in Bootstrap (MudBlazor's IDialogService, MudDialogProvider, MudDialog
 * and MudDialogInstance), with BlazorHero's logout dialog: shown with a title and parameters, closed with data by its
 * own button, canceled by Escape or Close; a declarative dialog inside it stays its own.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { CascadingParameter, ComponentBase, EventCallback, Parameter, type RenderTreeBuilder } from "@tsazor/runtime";
import { DialogReference, DialogService } from "@tsazor/ui";
import { Button, Dialog, DialogProvider } from "../dist/index.js";

type Renderer = Pick<Awaited<ReturnType<typeof renderTree>>, "settle">;
async function settle(renderer: Renderer): Promise<void> {
  await renderer.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.settle();
}

afterEach(() => {
  document.body.innerHTML = "";
});

/** BlazorHero's Shared/Dialogs/Logout.razor: a text, Cancel and the colored action. */
class LogoutDialog extends ComponentBase {
  static last: LogoutDialog | undefined;
  @Parameter() contentText = "";
  @Parameter() buttonText = "Logout";
  @CascadingParameter({ type: DialogReference }) dialog?: DialogReference;
  /** A declarative dialog inside it ("Are you really sure?"). */
  inner = false;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    LogoutDialog.last = this;
    b.openComponent(0, Dialog);
    b.addAttribute(1, "childContent", (c: RenderTreeBuilder) => {
      c.openElement(0, "p");
      c.addAttribute(1, "class", "content");
      c.addContent(2, this.contentText);
      c.closeElement();
      c.openComponent(3, Dialog);
      c.addAttribute(4, "isOpen", this.inner);
      c.addAttribute(5, "title", "Inner");
      c.addAttribute(6, "onClosed", EventCallback.bind(this, () => {
        this.inner = false;
      }));
      c.closeComponent();
    });
    b.addAttribute(2, "footer", (f: RenderTreeBuilder) => {
      f.openComponent(0, Button);
      f.addAttribute(1, "onClick", EventCallback.bind(this, () => this.dialog!.cancel()));
      f.addAttribute(2, "childContent", (c: RenderTreeBuilder) => c.addContent(0, "Cancel"));
      f.closeComponent();
      f.openComponent(3, Button);
      f.addAttribute(4, "onClick", EventCallback.bind(this, () => this.dialog!.close(true)));
      f.addAttribute(5, "childContent", (c: RenderTreeBuilder) => c.addContent(0, this.buttonText));
      f.closeComponent();
    });
    b.closeComponent();
  }
}

async function provider() {
  const dialogs = new DialogService();
  const result = await renderTree(
    (b) => {
      b.openComponent(0, DialogProvider);
      b.closeComponent();
    },
    { services: (services) => services.registerValue(DialogService, dialogs) },
  );
  return { dialogs, ...result };
}

const buttonNamed = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === text)!;

describe("DialogService with DialogProvider and a hosted Dialog", () => {
  it("shows a component as a dialog with show's title and parameters; its own button closes it with data", async () => {
    const { dialogs, ...renderer } = await provider();
    const shown = dialogs.show(LogoutDialog, { title: "Logout", parameters: { contentText: "Logout Confirmation" } });
    await settle(renderer);

    const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
    expect(dialog.querySelector("h2")!.textContent).toBe("Logout");
    expect(dialog.getAttribute("aria-labelledby")).toBe(dialog.querySelector("h2")!.id);
    expect(dialog.querySelector(".content")!.textContent).toBe("Logout Confirmation");

    buttonNamed("Logout").click();
    await settle(renderer);

    await expect(shown.result).resolves.toEqual({ canceled: false, data: true });
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("Escape and the header's Close button cancel it", async () => {
    const { dialogs, ...renderer } = await provider();
    const first = dialogs.show(LogoutDialog, { title: "Logout" });
    await settle(renderer);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(renderer);
    await expect(first.result).resolves.toEqual({ canceled: true });

    const second = dialogs.show(LogoutDialog, { title: "Logout" });
    await settle(renderer);
    document.querySelector<HTMLButtonElement>("[role=dialog] [aria-label=Close]")!.click();
    await settle(renderer);
    await expect(second.result).resolves.toEqual({ canceled: true });
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("show's size and closing rules win over the Dialog's own", async () => {
    const { dialogs, ...renderer } = await provider();
    const shown = dialogs.show(LogoutDialog, { title: "Logout", size: "large", closeOnEscape: false });
    await settle(renderer);
    expect(document.querySelector(".modal-dialog")!.className).toContain("modal-lg");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(renderer);
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    shown.cancel();
    await settle(renderer);
  });

  it("a declarative dialog inside stays closed until opened, and closing it leaves the shown one open", async () => {
    const { dialogs, ...renderer } = await provider();
    const shown = dialogs.show(LogoutDialog, { title: "Logout" });
    await settle(renderer);
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);

    LogoutDialog.last!.inner = true;
    LogoutDialog.last!.stateHasChanged();
    await settle(renderer);
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(2);

    // By its own heading: the shown dialog contains the inner one, text and all.
    const inner = [...document.querySelectorAll<HTMLElement>("[role=dialog]")].find((dialog) => dialog.querySelector("h2")?.textContent === "Inner")!;
    inner.querySelector<HTMLButtonElement>("[aria-label=Close]")!.click();
    await settle(renderer);

    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
    expect(dialogs.dialogs).toEqual([shown]);
    shown.close();
    await expect(shown.result).resolves.toEqual({ canceled: false, data: undefined });
  });
});

/**
 * DialogService (MudBlazor's IDialogService): show returns a reference whose result the page awaits; close and
 * cancel settle it once and take the dialog off the list the provider renders.
 */
import { describe, expect, it, vi } from "vitest";
import { ComponentBase } from "@tsazor/runtime";
import { DialogReference, DialogService } from "../src/index";

class Logout extends ComponentBase {
  contentText = "";
}
class Confirm extends ComponentBase {}

describe("DialogService", () => {
  it("shows a dialog with its title and parameters and notifies the provider", () => {
    const dialogs = new DialogService();
    const changes = vi.fn();
    dialogs.subscribe(changes);

    const dialog = dialogs.show(Logout, { title: "Logout", parameters: { contentText: "Sure?" }, size: "small" });

    expect(dialog).toBeInstanceOf(DialogReference);
    expect(dialogs.dialogs).toEqual([dialog]);
    expect(dialog.component).toBe(Logout);
    expect(dialog.options).toMatchObject({ title: "Logout", parameters: { contentText: "Sure?" }, size: "small" });
    expect(changes).toHaveBeenCalledOnce();
  });

  it("close(data) resolves the result with the data; cancel() as canceled; each once, the topmost last", async () => {
    const dialogs = new DialogService();
    const first = dialogs.show(Logout);
    const second = dialogs.show(Confirm);
    expect(dialogs.dialogs.map((dialog) => dialog.id)).toEqual([first.id, second.id]);

    second.close(true);
    second.cancel();
    first.cancel();
    first.close("late");

    await expect(second.result).resolves.toEqual({ canceled: false, data: true });
    await expect(first.result).resolves.toEqual({ canceled: true });
    expect(dialogs.dialogs).toEqual([]);
  });
});

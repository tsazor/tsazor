/**
 * F2 `@attach` (docs/design-svelte-features.md §F2) end to end: compiled
 * markup attaches after the element is in the DOM, a method group stays the
 * same function (attached once), a factory call re-attaches every render, a
 * field holding the attachment does not, named attachments are independent,
 * and removal cleans up. Blazor has no counterpart (`@ref` +
 * `OnAfterRenderAsync` + `IAsyncDisposable`).
 */
import { describe, expect, it } from "vitest";
import { mount } from "../harness.js";

const SEARCH = /* tsazor */ `
@if (open) {
    <input class="search" @attach="autofocus" @attach:log="logFocus" />
}
<button title="Save" @attach="tooltip('Save the document')" @attach:held="savedTip">Save</button>
@code {
    open = true;
    log = [];
    autofocus = (input) => input.focus();
    logFocus(input) {
        this.log.push("attach " + input.className + " connected=" + input.isConnected);
        return () => this.log.push("cleanup " + input.className);
    }
    tooltip(text) {
        return (button) => {
            this.log.push("tooltip " + text);
            button.dataset.tip = text;
            return () => this.log.push("untooltip " + text);
        };
    }
    savedTip = this.tooltip("held");
}
`;

describe("@attach (F2)", () => {
  it("attaches once the element is in the DOM; a method group is bound and attached once", async () => {
    const m = await mount(SEARCH);
    const input = m.container.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    expect(m.instance["log"]).toEqual(["attach search connected=true", "tooltip Save the document", "tooltip held"]);
    expect(m.container.querySelector("button")!.dataset["tip"]).toBe("held");
  });

  it("re-attaches a factory call each render, keeps a field and a bound method attached", async () => {
    const m = await mount(SEARCH);
    const log = m.instance["log"] as string[];
    log.length = 0;
    await m.rerender();
    expect(log).toEqual(["untooltip Save the document", "tooltip Save the document"]);
  });

  it("cleans up when the element is removed", async () => {
    const m = await mount(SEARCH);
    const log = m.instance["log"] as string[];
    log.length = 0;
    m.instance["open"] = false;
    await m.rerender();
    expect(m.container.querySelector("input")).toBeNull();
    expect(log).toContain("cleanup search");
    expect(log).not.toContain("untooltip held");
  });
});

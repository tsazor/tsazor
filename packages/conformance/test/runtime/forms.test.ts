/**
 * EditForm submit semantics vs. Blazor. Review §3 (EditForm), roadmap 3.5.
 */
import { describe, expect, it } from "vitest";
import { defineComponent, EditForm, EventCallback, ValidationMessage, type RenderTreeBuilder } from "@tsazor/runtime";
import { host } from "./host.js";

async function formHost(attrs: Record<string, unknown>) {
  const h = await host((b) => {
    b.openComponent(0, defineComponent(EditForm));
    b.addAttribute(1, "Model", { name: "" } as never);
    b.addAttribute(2, "Validators", { name: (v: unknown) => (v ? null : "required") } as never);
    let seq = 3;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value as never);
    b.addAttribute(10, "ChildContent", ((inner: RenderTreeBuilder) => {
      inner.openElement(0, "button");
      inner.addAttribute(1, "type", "submit");
      inner.closeElement();
      inner.openComponent(2, defineComponent(ValidationMessage));
      inner.addAttribute(3, "For", "name");
      inner.closeComponent();
    }) as never);
    b.closeComponent();
  });
  const submit = async (): Promise<void> => {
    h.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await h.settle();
  };
  return { h, submit };
}

describe("EditForm submit callbacks", () => {
  it("OnValidSubmit is not called for an invalid model", async () => {
    const calls: string[] = [];
    const { submit } = await formHost({ OnValidSubmit: EventCallback.unbound(() => void calls.push("valid")) });
    await submit();
    expect(calls).toEqual([]);
  });

  it.fails("OnInvalidSubmit is called for an invalid model", async () => {
    const calls: string[] = [];
    const { submit } = await formHost({ OnInvalidSubmit: EventCallback.unbound(() => void calls.push("invalid")) });
    await submit();
    expect(calls).toEqual(["invalid"]);
  });

  // Passes today by accident: the OnSubmit attribute lands in additionalAttributes
  // and replaces the form's own submit listener. Kept as a regression guard for 3.5.
  it("OnSubmit replaces validation: called once, without validating", async () => {
    const calls: string[] = [];
    const { h, submit } = await formHost({ OnSubmit: EventCallback.unbound(() => void calls.push("submit")) });
    await submit();
    expect({ calls, messages: h.text() }).toEqual({ calls: ["submit"], messages: "" });
  });

  it.fails("an async OnValidSubmit is awaited before the renderer is idle", async () => {
    let done = false;
    const { h } = await host((b) => {
      b.openComponent(0, defineComponent(EditForm));
      b.addAttribute(1, "Model", { name: "x" } as never);
      b.addAttribute(
        2,
        "OnValidSubmit",
        EventCallback.unbound(async () => {
          await new Promise((r) => setTimeout(r, 20));
          done = true;
        }),
      );
      b.addAttribute(3, "ChildContent", ((inner: RenderTreeBuilder) => {
        inner.openElement(0, "button");
        inner.closeElement();
      }) as never);
      b.closeComponent();
    }).then((h) => ({ h }));
    h.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await h.renderer.waitUntilIdle();
    expect(done).toBe(true);
  });
});

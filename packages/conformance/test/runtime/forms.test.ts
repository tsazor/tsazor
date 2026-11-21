/**
 * EditForm submit semantics vs. Blazor (src/Components/Web/src/Forms/EditForm.cs).
 * Review §3 (EditForm), roadmap 3.5.
 */
import { describe, expect, it } from "vitest";
import { defineComponent, EditForm, EditContext, EventCallback, InputText, ValidationMessage, type RenderTreeBuilder } from "@tsazor/runtime";
import { host } from "./host.js";

async function formHost(attrs: Record<string, unknown>) {
  const h = await host((b) => {
    b.openComponent(0, defineComponent(EditForm));
    b.addAttribute(1, "Model", { name: "" } as never);
    b.addAttribute(2, "Validators", { name: (v: unknown) => (v ? null : "required") } as never);
    let seq = 3;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value as never);
    b.addAttribute(10, "ChildContent", ((_context: EditContext) => (inner: RenderTreeBuilder) => {
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

  it("OnInvalidSubmit is called for an invalid model", async () => {
    const calls: string[] = [];
    const { submit } = await formHost({ OnInvalidSubmit: EventCallback.unbound(() => void calls.push("invalid")) });
    await submit();
    expect(calls).toEqual(["invalid"]);
  });

  it("OnSubmit replaces validation: called once, without validating", async () => {
    const calls: string[] = [];
    const { h, submit } = await formHost({ OnSubmit: EventCallback.unbound(() => void calls.push("submit")) });
    await submit();
    // Blazor's HandleSubmitAsync: with OnSubmit there is no validation pass,
    // so the ValidationMessage for the (invalid, empty) name never appears.
    expect({ calls, messages: h.text() }).toEqual({ calls: ["submit"], messages: "" });
  });

  it("an async OnValidSubmit is awaited before the renderer is idle", async () => {
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
      b.addAttribute(3, "ChildContent", (() => (inner: RenderTreeBuilder) => {
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

describe("EditForm context semantics (3.5)", () => {
  it("throws Blazor's error messages for Model/EditContext/OnSubmit misuse", async () => {
    // Blazor's OnParametersSet: both parameters.
    await expect(
      host((b) => {
        b.openComponent(0, defineComponent(EditForm));
        b.addAttribute(1, "Model", {} as never);
        b.addAttribute(2, "EditContext", new EditContext({} as object) as never);
        b.closeComponent();
      }),
    ).rejects.toThrow("EditForm requires a Model parameter, or an EditContext parameter, but not both.");

    // Blazor's OnParametersSet: neither parameter.
    await expect(
      host((b) => {
        b.openComponent(0, defineComponent(EditForm));
        b.closeComponent();
      }),
    ).rejects.toThrow("EditForm requires either a Model parameter, or an EditContext parameter, please provide one of these.");

    // Blazor's OnParametersSet: OnSubmit combined with the routed callbacks.
    await expect(
      host((b) => {
        b.openComponent(0, defineComponent(EditForm));
        b.addAttribute(1, "Model", {} as never);
        b.addAttribute(2, "OnSubmit", EventCallback.unbound(() => {}) as never);
        b.addAttribute(3, "OnValidSubmit", EventCallback.unbound(() => {}) as never);
        b.closeComponent();
      }),
    ).rejects.toThrow("When supplying an OnSubmit parameter to EditForm, do not also supply OnValidSubmit or OnInvalidSubmit.");
  });

  it("cascades the EditContext to the child content", async () => {
    const contexts: EditContext[] = [];
    const h = await host((b) => {
      b.openComponent(0, defineComponent(EditForm));
      b.addAttribute(1, "Model", { name: "a" } as never);
      b.addAttribute(2, "ChildContent", ((context: EditContext) => (inner: RenderTreeBuilder) => {
        contexts.push(context);
        inner.openElement(0, "p");
        inner.addAttribute(1, "data-model", context.model.name);
        inner.closeElement();
      }) as never);
      b.closeComponent();
    });
    expect((h.container.querySelector("p[data-model]") as HTMLElement).dataset.model).toBe("a");
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts[0]!.model).toEqual({ name: "a" });
  });

  it("a recreated context (new Model) tears down the form's subtree", async () => {
    // Blazor renders the form inside OpenRegion(_editContext.GetHashCode());
    // here the region sequence is the context's identity, so a new Model —
    // and with it a new EditContext — rebuilds the whole subtree.
    const modelA = { name: "a" };
    const contexts: EditContext[] = [];
    const child: (context: EditContext) => RenderFragment = (context) => (inner) => {
      contexts.push(context);
      inner.openElement(0, "input");
      inner.addAttribute(1, "value", context.model.name);
      inner.closeElement();
    };
    const build = (model: object): ((b: RenderTreeBuilder) => void) => (b) => {
      b.openComponent(0, defineComponent(EditForm));
      b.addAttribute(1, "Model", model as never);
      b.addAttribute(2, "ChildContent", child as never);
      b.closeComponent();
    };
    const h = await host(build(modelA));
    const inputBefore = h.container.querySelector("input")!;
    expect(contexts.length).toBe(1);

    await h.update(build({ name: "b" }));
    const inputAfter = h.container.querySelector("input")!;
    // New context, rebuilt subtree, fresh element with the new model value.
    expect(contexts).toHaveLength(2);
    expect(contexts[1]).not.toBe(contexts[0]);
    expect(inputAfter).not.toBe(inputBefore);
    expect(inputAfter.value).toBe("b");
  });

  it("an EditContext parameter survives parent re-renders (no context around the absent Model)", async () => {
    // Blazor compares Model only when one is supplied; comparing the absent
    // Model with the context's model recreated `new EditContext(undefined)`
    // on every re-render — the subtree (inputs, ValidationMessages) was
    // rebuilt against an empty context.
    const editContext = new EditContext({ name: "" });
    editContext.setValidator("name", (value) => (value === "" ? "name missing" : null));
    const contexts: EditContext[] = [];
    const build = (b: RenderTreeBuilder) => {
      b.openComponent(0, defineComponent(EditForm));
      b.addAttribute(1, "EditContext", editContext as never);
      b.addAttribute(2, "ChildContent", ((context: EditContext) => (inner: RenderTreeBuilder) => {
        contexts.push(context);
        inner.openElement(0, "input");
        inner.closeElement();
        inner.openComponent(1, defineComponent(ValidationMessage));
        inner.addAttribute(2, "For", "name");
        inner.closeComponent();
      }) as never);
      b.closeComponent();
    };
    const h = await host(build);
    const input = h.container.querySelector("input");
    editContext.validate();
    await h.update(build);
    await h.update(build);
    expect(new Set(contexts)).toEqual(new Set([editContext]));
    expect(h.container.querySelector("input")).toBe(input);
    expect(h.container.querySelector(".validation-message")?.textContent).toBe("name missing");
  });

  it("an input writes the bound model before the field-change validation runs (Blazor's order)", async () => {
    const model = { name: "" };
    const editContext = new EditContext(model);
    const seen: string[] = [];
    // A validator that reads the model instead of its value argument.
    editContext.setValidator("name", () => {
      seen.push(model.name);
      return null;
    });
    const h = await host((b) => {
      b.openComponent(0, defineComponent(EditForm));
      b.addAttribute(1, "EditContext", editContext as never);
      b.addAttribute(2, "ChildContent", ((_context: EditContext) => (inner: RenderTreeBuilder) => {
        inner.openComponent(0, defineComponent(InputText));
        inner.addAttribute(1, "Value", model.name);
        inner.addAttribute(2, "ValueChanged", EventCallback.unbound((value: string) => (model.name = value)) as never);
        inner.addAttribute(3, "ValueExpression", "name");
        inner.closeComponent();
      }) as never);
      b.closeComponent();
    });
    const input = h.container.querySelector("input")!;
    input.value = "typed";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(["typed"]);
  });
});
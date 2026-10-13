/**
 * F16: FocusOnInvalidSubmit — after a submit that finds errors, the first invalid field of the form (InputBase's
 * aria-invalid, in form order) takes the focus, as react-hook-form's shouldFocusError.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, EditForm, EventCallback, FocusOnInvalidSubmit, InputText, Renderer, defineComponent, type EditContext, type RenderTreeBuilder } from "../src/index";

class SignUp extends ComponentBase {
  static withFocus = true;
  model = { first: "", second: "", third: "" };

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(EditForm));
    b.addAttribute(1, "Model", this.model);
    const required = (v: unknown) => (typeof v === "string" && v !== "" ? null : "Required");
    b.addAttribute(2, "Validators", { second: required, third: required });
    b.addContent(3, (_context: EditContext) => (inner: RenderTreeBuilder) => {
      for (const [index, field] of (["first", "second", "third"] as const).entries()) {
        inner.openComponent(10 + index * 5, defineComponent(InputText));
        inner.addAttribute(11 + index * 5, "id", field);
        inner.addAttribute(12 + index * 5, "Value", this.model[field]);
        inner.addAttribute(13 + index * 5, "ValueChanged", EventCallback.bind(this, (v: string) => (this.model[field] = v)));
        inner.addAttribute(14 + index * 5, "ValueExpression", field);
        inner.closeComponent();
      }
      if (SignUp.withFocus) {
        inner.openComponent(30, defineComponent(FocusOnInvalidSubmit));
        inner.closeComponent();
      }
      inner.openElement(31, "button");
      inner.addAttribute(32, "type", "submit");
      inner.closeElement();
    });
    b.closeComponent();
  }
}

async function render(withFocus: boolean) {
  SignUp.withFocus = withFocus;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  renderer.renderInContainer(SignUp, container);
  await renderer.waitUntilIdle();
  const submit = async () => {
    container.querySelector<HTMLButtonElement>("button")!.focus();
    container.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await renderer.waitUntilIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const field = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;
  return { submit, field, renderer };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FocusOnInvalidSubmit (F16)", () => {
  it("focuses the first invalid field after a submit with errors, and nothing after a valid one", async () => {
    const { submit, field, renderer } = await render(true);
    await submit();
    expect(document.activeElement?.id).toBe("second");

    field("second").value = "x";
    field("second").dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    await submit();
    expect(document.activeElement?.id).toBe("third");

    field("third").value = "y";
    field("third").dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    await submit();
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("without it the focus stays on the button, as Blazor's EditForm leaves it", async () => {
    const { submit } = await render(false);
    await submit();
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("needs an EditForm", () => {
    const outside = new FocusOnInvalidSubmit() as unknown as { onInitialized(): void };
    expect(() => outside.onInitialized()).toThrow(/requires a cascading parameter of type EditContext/);
  });
});

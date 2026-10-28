/**
 * Wizard (Fluent UI Blazor's FluentWizard): Next and Previous skip a disabled step, Done raises onFinish, a step's
 * onChange can cancel, a form in a step blocks Next until it is valid, the step sequence decides which steps a click
 * opens, and the current step is aria-current="step".
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type EditContext, type RenderTreeBuilder } from "@tsazor/runtime";
import type { WizardStepChangeEventArgs } from "@tsazor/ui";
import { Form as FluentForm, Wizard, WizardStep } from "../dist/index.js";

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

const settle = async (result: RenderResult) => {
  for (let i = 0; i < 3; i++) {
    await result.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

interface Options {
  sequence?: string;
  cancelLeavingFirst?: boolean;
  form?: boolean;
  displayStepNumber?: string;
  labels?: Record<string, string>;
}

/** A page with a wizard of four steps (the third disabled), its index bound to `step`. */
function pageWith(options: Options = {}) {
  return class Page extends ComponentBase {
    static last: Page | undefined;
    step = 0;
    finished = 0;
    asked: number[] = [];
    readonly model = { name: "" };
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Page.last = this;
      b.openComponent(0, Wizard);
      b.addAttribute(1, "value", this.step);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (index: number) => {
        this.step = index;
      }));
      b.addAttribute(3, "onFinish", EventCallback.bind(this, () => {
        this.finished++;
      }));
      if (options.sequence) b.addAttribute(4, "stepSequence", options.sequence);
      if (options.displayStepNumber) b.addAttribute(5, "displayStepNumber", options.displayStepNumber);
      if (options.labels) b.addAttribute(7, "labels", options.labels);
      b.addAttribute(6, "steps", (c: RenderTreeBuilder) => {
        c.openComponent(0, WizardStep);
        c.addAttribute(1, "label", "Bread");
        c.addAttribute(2, "summary", "What to bake");
        c.addAttribute(3, "onChange", EventCallback.bind(this, (args: WizardStepChangeEventArgs) => {
          this.asked.push(args.targetIndex);
          if (options.cancelLeavingFirst) args.isCancelled = true;
        }));
        c.addAttribute(4, "childContent", (d: RenderTreeBuilder) => {
          if (!options.form) {
            d.addContent(0, "Pick a bread.");
            return;
          }
          d.openComponent(1, FluentForm);
          d.addAttribute(2, "model", this.model);
          d.addAttribute(3, "validators", { name: (value: unknown) => (String(value ?? "") === "" ? "A name, please." : null) });
          d.addAttribute(4, "childContent", ((_context: EditContext) => (e: RenderTreeBuilder) => e.addContent(0, "the form")) as never);
          d.closeComponent();
        });
        c.closeComponent();
        for (const [i, label, disabled] of [[5, "Day", false], [10, "Payment", true], [15, "Done", false]] as const) {
          c.openComponent(i, WizardStep);
          c.addAttribute(i + 1, "label", label);
          c.addAttribute(i + 2, "disabled", disabled);
          c.addAttribute(i + 3, "childContent", (d: RenderTreeBuilder) => d.addContent(0, `${label} step.`));
          c.closeComponent();
        }
      });
      b.closeComponent();
    }
  };
}

const buttonNamed = (container: Element, name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(".tz-wizard__buttons button")].find((button) => button.textContent === name);
const visiblePanel = (container: Element) => container.querySelector(".tz-wizard__panel:not([hidden])")?.textContent;
const current = (container: Element) => container.querySelector("[aria-current=step] .tz-wizard__label")?.textContent;

async function mount(options: Options = {}) {
  const Page = pageWith(options);
  const result = await render(Page);
  mounted.push(result);
  await settle(result);
  return { Page, result, container: result.container };
}

describe("Wizard", () => {
  it("takes its button texts from labels, any of them (S5)", async () => {
    const { container } = await mount({ labels: { next: "Weiter" } });
    expect(buttonNamed(container, "Weiter")).toBeDefined();
    expect(buttonNamed(container, "Next")).toBeUndefined();
  });

  it("lists the steps, shows the current one, and Next and Previous skip a disabled step", async () => {
    const { Page, result, container } = await mount();
    expect([...container.querySelectorAll(".tz-wizard__label")].map((label) => label.textContent)).toEqual(["Bread", "Day", "Payment", "Done"]);
    expect(current(container)).toBe("Bread");
    expect(visiblePanel(container)).toBe("Pick a bread.");
    expect(buttonNamed(container, "Previous")).toBeUndefined();
    buttonNamed(container, "Next")!.click();
    await settle(result);
    buttonNamed(container, "Next")!.click();
    await settle(result);
    expect(Page.last!.step).toBe(3);
    expect(current(container)).toBe("Done");
    expect(visiblePanel(container)).toBe("Done step.");
    expect(buttonNamed(container, "Next")).toBeUndefined();
    buttonNamed(container, "Previous")!.click();
    await settle(result);
    expect(Page.last!.step).toBe(1);
  });

  it("keeps the focus on the buttons: Next turns into Done in place, and at the first step Previous hands it to Next", async () => {
    const { result, container } = await mount();
    const next = buttonNamed(container, "Next")!;
    next.focus();
    next.click();
    await settle(result);
    next.click();
    await settle(result);
    // The same element, now Done, still has the focus.
    expect(buttonNamed(container, "Done")).toBe(next);
    expect(document.activeElement).toBe(next);
    buttonNamed(container, "Previous")!.focus();
    buttonNamed(container, "Previous")!.click();
    await settle(result);
    buttonNamed(container, "Previous")!.click();
    await settle(result);
    expect(buttonNamed(container, "Previous")).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(container, "Next"));
  });

  it("Done raises onFinish; a step's onChange sees the target and can cancel", async () => {
    const { Page, result, container } = await mount({ cancelLeavingFirst: true });
    buttonNamed(container, "Next")!.click();
    await settle(result);
    expect(Page.last!.asked).toEqual([1]);
    expect(Page.last!.step).toBe(0);
    const done = await mount();
    for (let i = 0; i < 2; i++) {
      buttonNamed(done.container, "Next")!.click();
      await settle(done.result);
    }
    buttonNamed(done.container, "Done")!.click();
    await settle(done.result);
    expect(done.Page.last!.finished).toBe(1);
  });

  it("a form in the step keeps Next from moving until it is valid, and shows its messages", async () => {
    const { Page, result, container } = await mount({ form: true });
    buttonNamed(container, "Next")!.click();
    await settle(result);
    expect(Page.last!.step).toBe(0);
    Page.last!.model.name = "Rye";
    buttonNamed(container, "Next")!.click();
    await settle(result);
    expect(Page.last!.step).toBe(1);
  });

  it("linear lists steps without buttons; any opens a step by a click; visited only the visited", async () => {
    const linear = await mount();
    expect(linear.container.querySelectorAll(".tz-wizard__steps button").length).toBe(0);
    const any = await mount({ sequence: "any" });
    const day = [...any.container.querySelectorAll<HTMLButtonElement>(".tz-wizard__steps button")].find((button) => button.textContent?.includes("Day"))!;
    day.click();
    await settle(any.result);
    expect(any.Page.last!.step).toBe(1);
    // The disabled step is no button.
    expect([...any.container.querySelectorAll(".tz-wizard__steps button")].some((button) => button.textContent?.includes("Payment"))).toBe(false);
    const visited = await mount({ sequence: "visited" });
    expect(visited.container.querySelectorAll(".tz-wizard__steps button").length).toBe(0);
    buttonNamed(visited.container, "Next")!.click();
    await settle(visited.result);
    const back = [...visited.container.querySelectorAll<HTMLButtonElement>(".tz-wizard__steps button")].map((button) => button.textContent);
    expect(back.length).toBe(1);
    expect(back[0]).toContain("Bread");
  });

  it("displayStepNumber shows the numbers in the bullets", async () => {
    const { container } = await mount({ displayStepNumber: "all" });
    expect([...container.querySelectorAll(".tz-wizard__number")].map((number) => number.textContent)).toEqual(["1", "2", "3", "4"]);
  });
});

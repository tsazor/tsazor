import { describe, expect, it } from "vitest";
import { WizardStepChangeEventArgs } from "../src/index";
import { isWizardStepClickable, nextWizardStep, previousWizardStep, wizardStepStatus } from "../src/kit";

describe("wizard navigation (Fluent UI Blazor's FluentWizard)", () => {
  it("next and previous skip disabled steps; -1 at the ends", () => {
    const disabled = [false, true, false, false, true];
    expect(nextWizardStep(disabled, 0)).toBe(2);
    expect(nextWizardStep(disabled, 3)).toBe(-1);
    expect(previousWizardStep(disabled, 2)).toBe(0);
    expect(previousWizardStep(disabled, 0)).toBe(-1);
  });

  it("a step is before, at or after the current one", () => {
    expect([0, 1, 2].map((i) => wizardStepStatus(i, 1))).toEqual(["previous", "current", "next"]);
  });

  it("linear opens no step by a click; any opens every other; visited only the visited ones", () => {
    expect(isWizardStepClickable(0, 1, "linear", 1, false)).toBe(false);
    expect(isWizardStepClickable(3, 1, "any", 1, false)).toBe(true);
    expect(isWizardStepClickable(1, 1, "any", 1, false)).toBe(false);
    expect(isWizardStepClickable(2, 0, "visited", 2, false)).toBe(true);
    expect(isWizardStepClickable(3, 0, "visited", 2, false)).toBe(false);
    expect(isWizardStepClickable(0, 1, "any", 1, true)).toBe(false);
  });

  it("the change args carry the target and can be cancelled", () => {
    const args = new WizardStepChangeEventArgs(2, "Payment");
    args.isCancelled = true;
    expect([args.targetIndex, args.targetLabel, args.isCancelled]).toEqual([2, "Payment", true]);
  });
});

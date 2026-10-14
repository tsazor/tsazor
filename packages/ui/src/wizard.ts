/**
 * A wizard's navigation (Fluent UI Blazor's FluentWizard), shared by both skins: which step comes next or before
 * (skipping disabled ones), which steps a click may open (`stepSequence`), and each step's status.
 */

/** Which steps a click on the step list may open: none (linear: the buttons only), any, or the ones visited. */
import type { LibraryTexts } from "./library-texts.js";

export type WizardStepSequence = "linear" | "any" | "visited";

/** A step before the current one, the current one, or one after it. */
export type WizardStepStatus = "previous" | "current" | "next";

/** What a step change hands the current step's `onChange` (FluentWizardStepChangeEventArgs): set `isCancelled` to stay. */
export class WizardStepChangeEventArgs {
  /** The step it would open. */
  readonly targetIndex: number;
  /** That step's label. */
  readonly targetLabel: string;
  isCancelled = false;

  constructor(targetIndex: number, targetLabel: string) {
    this.targetIndex = targetIndex;
    this.targetLabel = targetLabel;
  }
}

/** The index of the next enabled step after `from`, or -1. */
export function nextWizardStep(disabled: readonly boolean[], from: number): number {
  for (let i = from + 1; i < disabled.length; i++) if (!disabled[i]) return i;
  return -1;
}

/** The index of the enabled step before `from`, or -1. */
export function previousWizardStep(disabled: readonly boolean[], from: number): number {
  for (let i = from - 1; i >= 0; i--) if (!disabled[i]) return i;
  return -1;
}

export function wizardStepStatus(index: number, current: number): WizardStepStatus {
  return index < current ? "previous" : index === current ? "current" : "next";
}

/** Whether a click on the step at `index` opens it (FluentWizardStep's IsStepClickable). */
export function isWizardStepClickable(
  index: number,
  current: number,
  sequence: WizardStepSequence,
  maxVisited: number,
  disabled: boolean,
): boolean {
  if (disabled || index === current || sequence === "linear") return false;
  return sequence === "any" || index <= maxVisited;
}

/** A Wizard's button texts (MudBlazor's PreviousText, NextText, DoneText); `labels` overrides any of them. */
export interface WizardLabels {
  previous: string;
  next: string;
  done: string;
}

/** The Wizard's texts in the culture of `t` (the library texts "wizard.previous", …). */
export function wizardLabelsFrom(t: LibraryTexts): WizardLabels {
  return { previous: t("wizard.previous"), next: t("wizard.next"), done: t("wizard.done") };
}

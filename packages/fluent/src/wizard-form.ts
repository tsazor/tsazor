/** A form in a wizard's step, as the step sees it (WizardFormLink registers it): its submit validates the form and
 *  reports the result as a submit would; it resolves to whether the form was valid. */
export interface WizardForm {
  submit(): Promise<boolean>;
}

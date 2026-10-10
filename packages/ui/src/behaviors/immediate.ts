/**
 * Fluent UI Blazor's `Immediate` (FluentInputImmediateManager): a text field's value follows the typing instead of
 * waiting for `change`, once the typing pauses for `delay` ms (`ImmediateDelay`, 200 by default). A burst of keys
 * becomes one update, and it carries the field's value when the pause ends, not at the first key. A `change` (blur,
 * Enter) applies at once and cancels the pending update; so does disposing the component (`signal`).
 */
export class ImmediateInput {
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(signal?: AbortSignal) {
    signal?.addEventListener("abort", () => this.cancel());
  }

  /** On `input`: calls `apply` with the field's value once the typing pauses for `delay` ms. */
  input(event: Event, delay: number, apply: (value: string) => void): void {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.cancel();
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      apply(field.value);
    }, Math.max(0, delay));
  }

  /** Drops the pending update (a `change` applies the value itself). */
  cancel(): void {
    if (this.#timer === undefined) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** An update is waiting for the typing to pause. */
  get pending(): boolean {
    return this.#timer !== undefined;
  }
}

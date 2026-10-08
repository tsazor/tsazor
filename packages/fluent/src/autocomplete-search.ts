/**
 * What an autocomplete's `onOptionsSearch` handler gets (Fluent UI Blazor's OptionsSearchEventArgs<TOption>):
 * the text to search for; the handler sets `items`. `signal` aborts when a newer search starts, for a fetch
 * that should stop (a Tsazor addition: the older answer is dropped either way).
 */
export class OptionsSearchEventArgs<TOption> {
  /** The options to show; set by the handler. */
  items: readonly TOption[] = [];

  constructor(
    /** What the user typed. */
    readonly text: string,
    /** Aborts when a newer search starts. */
    readonly signal: AbortSignal,
  ) {}
}

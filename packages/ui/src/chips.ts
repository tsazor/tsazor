/**
 * A chip set's selection (MudBlazor's MudChipSet `SelectionMode`), shared by both skins: what a click on a chip makes of
 * the selected values.
 */

/**
 * - `none`: chips aren't selected (a list of tags, maybe closable);
 * - `single`: one chip is selected, and a click on it keeps it (MudBlazor's SingleSelection);
 * - `toggle`: one chip or none (ToggleSelection);
 * - `multiple`: any number (MultiSelection).
 */
export type ChipSelectionMode = "none" | "single" | "toggle" | "multiple";

/** The selected values after a click on the chip of `value`. */
export function nextChipSelection<T>(
  mode: ChipSelectionMode,
  selected: readonly T[],
  value: T,
  equals: (a: T, b: T) => boolean = Object.is,
): T[] {
  const has = selected.some((item) => equals(item, value));
  switch (mode) {
    case "none":
      return [...selected];
    case "single":
      return has ? [...selected] : [value];
    case "toggle":
      return has ? [] : [value];
    case "multiple":
      return has ? selected.filter((item) => !equals(item, value)) : [...selected, value];
  }
}

/**
 * A chip set's state, cascaded to its chips (as the DataGrid cascades its model): the mode, the selection and the
 * set-wide options. A chip asks it whether it is selected and tells it about clicks and closes; it notifies the chips
 * when the selection changes, since their own parameters don't.
 */
export class ChipSetModel<T> {
  mode: ChipSelectionMode = "single";
  /** A selected chip shows a check mark. */
  checkMark = false;
  /** Every chip has a close button. */
  allClosable = false;
  /** The chips can't be selected or closed. */
  readOnly = false;
  disabled = false;
  equals: (a: T, b: T) => boolean = Object.is;
  /** Reports a new selection to the set's bindings. */
  onSelect?: (selected: T[]) => Promise<void> | void;
  /** Reports a closed chip. */
  onClose?: (value: T) => Promise<void> | void;
  /** The index of a chip closed from the keyboard: the set moves the focus to the chip now there. */
  focusAfterClose: number | undefined;

  #selected: readonly T[] = [];
  readonly #listeners = new Set<() => void>();

  get selected(): readonly T[] {
    return this.#selected;
  }

  /** Takes the selection from the set's parameters; tells the chips when it changed. */
  setSelected(selected: readonly T[]): void {
    const same = selected.length === this.#selected.length && selected.every((value, i) => this.equals(value, this.#selected[i] as T));
    if (same) return;
    this.#selected = [...selected];
    this.#notify();
  }

  isSelected(value: T): boolean {
    return this.#selected.some((item) => this.equals(item, value));
  }

  /** A click on a chip: the new selection, reported. */
  async clickAsync(value: T): Promise<void> {
    if (this.readOnly || this.disabled || this.mode === "none") return;
    const next = nextChipSelection(this.mode, this.#selected, value, this.equals);
    if (next.length === this.#selected.length && next.every((item, i) => this.equals(item, this.#selected[i] as T))) return;
    this.#selected = next;
    this.#notify();
    await this.onSelect?.(next);
  }

  /** A chip's close button (or Delete on it); `index` is its place when the keyboard closed it. */
  async closeAsync(value: T, index?: number): Promise<void> {
    if (this.readOnly || this.disabled) return;
    this.focusAfterClose = index;
    await this.onClose?.(value);
  }

  /** Calls `listener` when the selection changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}

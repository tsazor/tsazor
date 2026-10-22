/**
 * A native select over typed options (the skins' Select with `items`, Fluent UI Blazor's FluentSelect<TOption>): each
 * `<option>` carries its index as its value, and a change maps it back to the option itself, so nothing is parsed.
 */

/** The index of `selected` in `items` — the same option by identity, else by `key` (by default its text) — or -1. */
export function selectedOptionIndex<T>(items: readonly T[], selected: T | null | undefined, key: (option: T) => unknown): number {
  if (selected === null || selected === undefined) return -1;
  const index = items.indexOf(selected);
  if (index >= 0) return index;
  const wanted = key(selected);
  return items.findIndex((item) => key(item) === wanted);
}

/** The option a native select's value names (its index as text); null for "" (the empty choice) or an unknown one. */
export function optionAtValue<T>(items: readonly T[], value: string): T | null {
  if (value === "") return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < items.length ? items[index]! : null;
}

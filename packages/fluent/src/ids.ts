/**
 * Automatic, unique element ids for the inputs: label (`for`) and message
 * (`aria-describedby`) must be associated even when the app gives no `id`.
 * Blazor's InputBase does the same (InputBase_IdGenerator) — every field
 * stays addressable without app-side bookkeeping.
 */

let nextId = 0;

/** The next generated field id (`<prefix>-N`, unique per app run). */
export function nextFieldId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}
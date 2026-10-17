/**
 * The spreadsheet's model (design-extended-library.md §2.6, v1 without
 * formulas — D-X4): a sheet of cells addressed in A1 notation, range
 * selection with a keyboard and a pointer, the undo stack over the cell
 * values (a paste is one step), copy and paste of a range within the sheet
 * (the system clipboard is not involved yet). The DOM and the chrome live in
 * an app's own markup (the engine cascades change like the library's
 * models). Doctrine of the value types: a cell's value is a string or a
 * number — a `Decimal` cell (the E12's value types) is a later decision.
 */

/** A cell's address: A1 notation, `"B3"`. */
export type CellAddress = string;

/** A cell: its column letter A-Z… and its 1-based row. */
export interface Cell {
  /** `B3` ⇒ "b", 3. */
  column: string;
  row: number;
}

/** Parses an A1 address; undefined for anything that isn't (an empty column, 0, or row 0). */
export function parseAddress(text: CellAddress | null | undefined): Cell | undefined {
  const match = /^([A-Za-z]+)(\d+)$/.exec(text ?? "");
  if (match === null) return undefined;
  const row = Number(match[2]);
  if (row === 0) return undefined;
  return { column: match[1]!.toLowerCase(), row };
}

/** The address back. */
export function formatAddress(cell: Cell): CellAddress {
  return `${cell.column.toUpperCase()}${cell.row}`;
}

/** The column's 0-based number: "a" ⇒ 0, "z" ⇒ 25, "aa" ⇒ 26. */
export function columnNumber(column: string): number {
  let number = 0;
  for (const character of column.toLowerCase()) number = number * 26 + (character.charCodeAt(0) - 96);
  return number - 1;
}

/** The 0-based number back ("aa" ⇒ 26 is the floor). */
export function formatColumn(number: number): string {
  let column = "";
  number += 1;
  while (number > 0) {
    column = String.fromCharCode(96 + ((number - 1) % 26) + 1) + column;
    number = Math.floor((number - 1) / 26);
  }
  return column;
}

/** A range's corners, inclusive; a whole range of ONE cell is that cell. */
export interface CellRange {
  from: Cell;
  to: Cell;
}

/** The normalized rectangle of a range: rows and columns ascending (the loop's order). */
export function rangeRectangle(range: CellRange): { from: Cell; to: Cell } {
  const from = { column: columnNumber(range.from.column) <= columnNumber(range.to.column) ? range.from.column : range.to.column, row: Math.min(range.from.row, range.to.row) };
  const to = { column: columnNumber(range.from.column) <= columnNumber(range.to.column) ? range.to.column : range.from.column, row: Math.max(range.from.row, range.to.row) };
  return { from, to };
}

/** Whether `cell` is inside `range` (the corners included). */
export function rangeHolds(range: CellRange, cell: Cell): boolean {
  const { from, to } = rangeRectangle(range);
  const number = columnNumber(cell.column);
  return number >= columnNumber(from.column) && number <= columnNumber(to.column) && cell.row >= Math.min(from.row, to.row) && cell.row <= Math.max(from.row, to.row);
}

/** A cell's value: text or a number; empty (an untouched cell) is undefined. */
export type CellValue = string | number | undefined;

/** One cell's change in an undo step. */
interface CellChange {
  address: string;
  from: CellValue;
  to: CellValue;
}

/**
 * The sheet: the cells set, the selection's range, the undo stack. A skin
 * renders `selection` (the range) and asks `valueOf` per cell; the changes
 * (set, undo, redo, paste) ask `onChange` to render again.
 */
export class SheetModel {
  private cells = new Map<string, CellValue>();
  private fromCell: Cell | undefined;
  private toCell: Cell | undefined;
  /** The undo stack, in order: a step is the cells one action changed (a set: one; a paste: the range), each with its before and after. */
  private readonly steps: CellChange[][] = [];
  private undone = 0;
  private clipboard: { range: CellRange; values: CellValue[] } | undefined;

  constructor(private readonly onChange: () => void) {}

  private key(cell: Cell): string {
    // A { column, row } from the app may spell the column in capitals ("B"); an A1 address arrives lowercased.
    return `${cell.column.toLowerCase()}:${cell.row}`;
  }

  private normalize(text: CellAddress | Cell | null | undefined): Cell | undefined {
    if (text === null || text === undefined) return undefined;
    return typeof text === "object" && "row" in text ? (text as Cell) : parseAddress(text as CellAddress);
  }

  /** A cell's value. */
  valueOf(cell: CellAddress | Cell | null | undefined): CellValue {
    const normalized = this.normalize(cell);
    return normalized === undefined ? undefined : this.cells.get(this.key(normalized));
  }

  /** Sets a cell's value (a number stays one; a string stays one); undefined clears. */
  async setAsync(cell: CellAddress | Cell, value: CellValue): Promise<void> {
    const normalized = this.normalize(cell);
    if (normalized === undefined) throw new RangeError("SheetModel: set a valid cell (A1 notation, or a { column, row }).");
    this.apply([{ cell: normalized, value }]);
  }

  /** Writes the values that change as one undo step, and renders once; nothing changes, nothing happens. */
  private apply(writes: readonly { cell: Cell; value: CellValue }[]): void {
    const step: CellChange[] = [];
    for (const { cell, value } of writes) {
      const address = this.key(cell);
      const valueNow = this.cells.get(address);
      if (Object.is(valueNow, value)) continue;
      step.push({ address, from: valueNow, to: value });
      this.write(address, value);
    }
    if (step.length === 0) return;
    // A new step drops the undone ones (in place: a long editing session stays linear).
    this.steps.length -= this.undone;
    this.steps.push(step);
    this.undone = 0;
    this.onChange();
  }

  private write(address: string, value: CellValue): void {
    if (value === undefined) this.cells.delete(address);
    else this.cells.set(address, value);
  }

  /** Marks the selection (the range's corners; a single cell is its own range). */
  select(from: CellAddress | Cell, to?: CellAddress | Cell): void {
    this.fromCell = this.normalize(from);
    this.toCell = this.normalize(to ?? from);
    this.onChange();
  }

  /** The selection's range, when selected. */
  get selection(): CellRange | undefined {
    return this.fromCell === undefined ? undefined : { from: this.fromCell, to: this.toCell! };
  }

  /** Whether `cell` is the selected one. */
  isSelected(cell: CellAddress | Cell): boolean {
    const normalized = this.normalize(cell);
    const selection = this.selection;
    return normalized !== undefined && selection !== undefined && rangeHolds(selection, normalized);
  }

  /** The selected cells as flat plain data (the app's save of a region). */
  selectedValues(): { addresses: CellAddress[]; values: CellValue[] } {
    const selection = this.selection;
    if (selection === undefined) return { addresses: [], values: [] };
    const { from, to } = rangeRectangle(selection);
    const addresses: CellAddress[] = [];
    const values: CellValue[] = [];
    for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++) {
      for (let number = columnNumber(from.column); number <= columnNumber(to.column); number++) {
        const cell = { column: formatColumn(number), row };
        addresses.push(formatAddress(cell));
        values.push(this.cells.get(this.key(cell)));
      }
    }
    return { addresses, values };
  }

  /** Copies the selection (the values ride in the class; no system clipboard). */
  copy(): void {
    const selection = this.selection;
    if (selection === undefined) return;
    this.clipboard = { range: selection, values: this.selectedValues().values };
  }

  /** Pastes the clipboard's values at a cell (a copy's shape; the values overwrite) — one undo step, one render. */
  async pasteAsync(at: CellAddress | Cell): Promise<void> {
    const pasted = this.normalize(at);
    if (pasted === undefined || this.clipboard === undefined) return;
    const { range, values } = this.clipboard;
    const rectangle = rangeRectangle(range);
    const width = columnNumber(rectangle.to.column) - columnNumber(rectangle.from.column) + 1;
    this.apply(
      values.map((value, offset) => ({
        cell: { column: formatColumn(columnNumber(pasted.column) + (offset % width)), row: pasted.row + Math.floor(offset / width) },
        value,
      })),
    );
  }

  /** Whether a paste is possible now. */
  get canPaste(): boolean {
    return this.clipboard !== undefined;
  }

  /** Whether a step can undo. */
  get canUndo(): boolean {
    return this.undone < this.steps.length;
  }

  /** Whether the last undone step can redo. */
  get canRedo(): boolean {
    return this.undone > 0;
  }

  /** Undoes the last step (a set, or a whole paste). */
  async undoAsync(): Promise<void> {
    const next = this.undone + 1;
    if (next > this.steps.length) return;
    for (const change of this.steps[this.steps.length - next]!) this.write(change.address, change.from);
    this.undone = next;
    this.onChange();
  }

  /** Redoes the last undone step. */
  async redoAsync(): Promise<void> {
    if (this.undone === 0) return;
    for (const change of this.steps[this.steps.length - this.undone]!) this.write(change.address, change.to);
    this.undone = this.undone - 1;
    this.onChange();
  }
}
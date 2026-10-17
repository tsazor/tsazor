/**
 * The spreadsheet's model (design-extended-library.md §2.6, v1 without
 * formulas — D-X4): a sheet of cells addressed in A1 notation, range
 * selection with a keyboard and a pointer, the undo stack over the cell
 * values (a paste is one step), copy and paste — of a range within the
 * sheet, and as TSV text for the system clipboard (Excel's form; the chrome
 * or the app hands it to the clipboard events). The values live in a source
 * (D-X11): a free sheet, or an app's records with the changes as patches to
 * save. The DOM and the chrome live in an app's own markup (the engine
 * cascades change like the library's models).
 */

import { FreeSheetSource, type CellValue, type SheetSource } from "./source.js";
import { formatTsv, parseTsv } from "./tsv.js";

export { FreeSheetSource, RecordSheetSource, type CellValue, type ParsedCell, type RecordChange, type SheetColumn, type SheetSource } from "./source.js";
export { formatTsv, parseTsv } from "./tsv.js";

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

/** One cell's change in an undo step (0-based, as the source counts). */
interface CellChange {
  row: number;
  column: number;
  from: CellValue;
  to: CellValue;
}

/** What a paste did: the cells it wrote, and those that refused (outside the sheet, read-only, a text a column can't read). */
export interface PasteResult {
  written: number;
  refused: number;
}

/**
 * The sheet: the source's values, the selection's range, the undo stack. A skin
 * renders `selection` (the range) and asks `valueOf` per cell; the changes
 * (set, undo, redo, paste) ask `onChange` to render again.
 */
export class SheetModel {
  private fromCell: Cell | undefined;
  private toCell: Cell | undefined;
  /** The undo stack, in order: a step is the cells one action changed (a set: one; a paste: the range), each with its before and after. */
  private readonly steps: CellChange[][] = [];
  private undone = 0;
  private clipboard: { range: CellRange; values: CellValue[] } | undefined;

  /** `source` holds the values: a free sheet when absent, or the app's records (RecordSheetSource). */
  constructor(
    private readonly onChange: () => void,
    readonly source: SheetSource = new FreeSheetSource(),
  ) {}

  private normalize(text: CellAddress | Cell | null | undefined): Cell | undefined {
    if (text === null || text === undefined) return undefined;
    return typeof text === "object" && "row" in text ? (text as Cell) : parseAddress(text as CellAddress);
  }

  /** A cell's value. */
  valueOf(cell: CellAddress | Cell | null | undefined): CellValue {
    const normalized = this.normalize(cell);
    return normalized === undefined ? undefined : this.source.valueAt(normalized.row - 1, columnNumber(normalized.column));
  }

  /** A cell's value as text (what a copy puts on the clipboard). */
  textOf(cell: CellAddress | Cell | null | undefined): string {
    const normalized = this.normalize(cell);
    return normalized === undefined ? "" : this.source.text(normalized.row - 1, columnNumber(normalized.column));
  }

  /** Sets a cell's value; undefined empties it. False when the cell refuses it (outside the sheet, read-only). */
  async setAsync(cell: CellAddress | Cell, value: CellValue): Promise<boolean> {
    return this.apply([{ cell: this.required(cell), value }]).refused === 0;
  }

  /** Sets a cell from a typed text, read as the source reads that cell (a number column reads a number). False when it refuses the text. */
  async setTextAsync(cell: CellAddress | Cell, text: string): Promise<boolean> {
    const normalized = this.required(cell);
    const parsed = this.source.parse(normalized.row - 1, columnNumber(normalized.column), text);
    return parsed !== null && this.apply([{ cell: normalized, value: parsed.value }]).refused === 0;
  }

  private required(cell: CellAddress | Cell): Cell {
    const normalized = this.normalize(cell);
    if (normalized === undefined) throw new RangeError("SheetModel: set a valid cell (A1 notation, or a { column, row }).");
    return normalized;
  }

  /** Writes the values that change as one undo step, and renders once; nothing changes, nothing happens. */
  private apply(writes: readonly { cell: Cell; value: CellValue }[], refusedBefore = 0): PasteResult {
    const step: CellChange[] = [];
    let refused = refusedBefore;
    for (const { cell, value } of writes) {
      const row = cell.row - 1;
      const column = columnNumber(cell.column);
      const from = this.source.valueAt(row, column);
      if (Object.is(from, value)) continue;
      if (!this.source.write(row, column, value)) {
        refused++;
        continue;
      }
      step.push({ row, column, from, to: value });
    }
    if (step.length > 0) {
      // A new step drops the undone ones (in place: a long editing session stays linear).
      this.steps.length -= this.undone;
      this.steps.push(step);
      this.undone = 0;
      this.onChange();
    }
    return { written: step.length, refused };
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

  /** The selected cells, row by row. */
  private selectedCells(): Cell[][] {
    const selection = this.selection;
    if (selection === undefined) return [];
    const { from, to } = rangeRectangle(selection);
    const rows: Cell[][] = [];
    for (let row = from.row; row <= to.row; row++) {
      const cells: Cell[] = [];
      for (let number = columnNumber(from.column); number <= columnNumber(to.column); number++) cells.push({ column: formatColumn(number), row });
      rows.push(cells);
    }
    return rows;
  }

  /** The selected cells as flat plain data (the app's save of a region). */
  selectedValues(): { addresses: CellAddress[]; values: CellValue[] } {
    const cells = this.selectedCells().flat();
    return { addresses: cells.map(formatAddress), values: cells.map((cell) => this.valueOf(cell)) };
  }

  /** Copies the selection within the sheet (the values ride in the model). */
  copy(): void {
    const selection = this.selection;
    if (selection === undefined) return;
    this.clipboard = { range: selection, values: this.selectedValues().values };
  }

  /** The selection as TSV text — what a spreadsheet puts on the system clipboard (the chrome's `copy` event sets it). */
  copyText(): string {
    return formatTsv(this.selectedCells().map((cells) => cells.map((cell) => this.textOf(cell))));
  }

  /** Pastes the clipboard's values at a cell (a copy's shape; the values overwrite) — one undo step, one render. */
  async pasteAsync(at: CellAddress | Cell): Promise<PasteResult> {
    const pasted = this.normalize(at);
    if (pasted === undefined || this.clipboard === undefined) return { written: 0, refused: 0 };
    const { range, values } = this.clipboard;
    const rectangle = rangeRectangle(range);
    const width = columnNumber(rectangle.to.column) - columnNumber(rectangle.from.column) + 1;
    return this.apply(
      values.map((value, offset) => ({
        cell: { column: formatColumn(columnNumber(pasted.column) + (offset % width)), row: pasted.row + Math.floor(offset / width) },
        value,
      })),
    );
  }

  /**
   * Pastes TSV text at a cell — a range copied in Excel, LibreOffice or another sheet (the chrome's `paste` event
   * reads it): each text is read as the source reads its cell; one undo step, one render. A text a cell can't
   * read, and a cell outside the sheet, is refused and counted.
   */
  async pasteTextAsync(at: CellAddress | Cell, text: string): Promise<PasteResult> {
    const pasted = this.normalize(at);
    if (pasted === undefined) return { written: 0, refused: 0 };
    const writes: { cell: Cell; value: CellValue }[] = [];
    let refused = 0;
    parseTsv(text).forEach((texts, rowOffset) =>
      texts.forEach((cellText, columnOffset) => {
        const cell = { column: formatColumn(columnNumber(pasted.column) + columnOffset), row: pasted.row + rowOffset };
        const parsed = this.source.parse(cell.row - 1, columnNumber(cell.column), cellText);
        if (parsed === null) refused++;
        else writes.push({ cell, value: parsed.value });
      }),
    );
    return this.apply(writes, refused);
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
    for (const change of this.steps[this.steps.length - next]!) this.source.write(change.row, change.column, change.from);
    this.undone = next;
    this.onChange();
  }

  /** Redoes the last undone step. */
  async redoAsync(): Promise<void> {
    if (this.undone === 0) return;
    for (const change of this.steps[this.steps.length - this.undone]!) this.source.write(change.row, change.column, change.to);
    this.undone = this.undone - 1;
    this.onChange();
  }
}


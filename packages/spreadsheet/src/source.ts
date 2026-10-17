/**
 * Where a sheet's values live (D-X11): the model reads and writes cells through a source, so the same selection,
 * undo and paste work over a free sheet and over an app's records — the sheet a data-driven app needs edits the
 * records it loaded from its backend and hands back what changed.
 */

/**
 * A cell's value: what the source holds there — text or a number in a free sheet, a record's property value (a
 * number, a `Decimal`, a date, …) in a record sheet. An empty cell is undefined (null in a record that has none).
 */
export type CellValue = unknown;

/** A text read for a cell: the value, or null when the cell refuses the text (a number column given "abc"). */
export type ParsedCell = { value: CellValue } | null;

/** The rows and columns of values a SheetModel shows and edits. Rows and columns are 0-based here. */
export interface SheetSource {
  /** The rows that exist: a paste beyond them is clipped. */
  readonly rowCount: number;
  /** The columns that exist. */
  readonly columnCount: number;
  /** The value of a cell. */
  valueAt(row: number, column: number): CellValue;
  /** Writes a cell's value; false when the cell refuses it (outside the sheet, a read-only column). */
  write(row: number, column: number, value: CellValue): boolean;
  /** The value a typed or pasted text means in this cell — the source knows its columns' types. */
  parse(row: number, column: number, text: string): ParsedCell;
  /** The cell's value as text: what a copy puts on the clipboard. */
  text(row: number, column: number): string;
}

/** A number as text is written without a culture (`1234.5`, `-3`, `2e3`); a culture's form takes a column's `parse`. */
const INVARIANT_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function holds(source: SheetSource, row: number, column: number): boolean {
  return Number.isInteger(row) && Number.isInteger(column) && row >= 0 && column >= 0 && row < source.rowCount && column < source.columnCount;
}

/** The free sheet: any cell holds text or a number; a text that reads as a number becomes one. Unbounded by default. */
export class FreeSheetSource implements SheetSource {
  readonly rowCount: number;
  readonly columnCount: number;
  private readonly cells = new Map<string, CellValue>();

  constructor(size: { rows?: number; columns?: number } = {}) {
    this.rowCount = size.rows ?? Number.POSITIVE_INFINITY;
    this.columnCount = size.columns ?? Number.POSITIVE_INFINITY;
  }

  valueAt(row: number, column: number): CellValue {
    return this.cells.get(`${row}:${column}`);
  }

  write(row: number, column: number, value: CellValue): boolean {
    if (!holds(this, row, column)) return false;
    if (value === undefined) this.cells.delete(`${row}:${column}`);
    else this.cells.set(`${row}:${column}`, value);
    return true;
  }

  parse(_row: number, _column: number, text: string): ParsedCell {
    const trimmed = text.trim();
    if (trimmed === "") return { value: undefined };
    return { value: INVARIANT_NUMBER.test(trimmed) ? Number(trimmed) : text };
  }

  text(row: number, column: number): string {
    const value = this.valueAt(row, column);
    return value === undefined || value === null ? "" : String(value);
  }
}

/** A column of a record sheet: one property of the records. */
export interface SheetColumn<T> {
  /** The property the column shows and edits. */
  field: keyof T & string;
  /** The header's text; the property's name when absent. */
  title?: string;
  /**
   * How a typed or pasted text becomes the value: "text" keeps it, "number" reads it without a culture (`1234.5`) and
   * refuses anything else. When absent, the first record that has a value decides. `parse` replaces both.
   */
  type?: "text" | "number";
  /** The column shows its values and refuses writes (a key, a computed total). */
  readOnly?: boolean;
  /** Reads a text for this column (a culture's numbers, a date, a `Decimal`); null refuses it. Empty text included. */
  parse?: (text: string) => ParsedCell;
  /** The value as text, for a copy (a `Decimal`'s or a date's own form); `String(value)` when absent. */
  format?: (value: CellValue) => string;
}

/** One record the sheet edited: the patch to save. */
export interface RecordChange<T> {
  /** The record, as the sheet edited it (in place). */
  record: T;
  /** Its row (0-based). */
  index: number;
  /** The edited properties with their current values. */
  values: Partial<T>;
}

/**
 * The record sheet: a row per record, a column per property (SheetColumn). A write sets the record's property in
 * place, and the source remembers each property's value from before the first edit: `changes()` are the patches to
 * save — an edit undone, or typed back to the old value, is no change — and `accept()` takes the current values as
 * saved, once the app stored them. An emptied cell is null (the JSON form of "none").
 */
export class RecordSheetSource<T extends object> implements SheetSource {
  private readonly originals = new Map<T, Map<keyof T & string, unknown>>();

  constructor(
    readonly records: readonly T[],
    readonly columns: readonly SheetColumn<T>[],
  ) {}

  get rowCount(): number {
    return this.records.length;
  }

  get columnCount(): number {
    return this.columns.length;
  }

  valueAt(row: number, column: number): CellValue {
    const record = this.records[row];
    const field = this.columns[column]?.field;
    return record === undefined || field === undefined ? undefined : record[field];
  }

  write(row: number, column: number, value: CellValue): boolean {
    const record = this.records[row];
    const spec = this.columns[column];
    if (record === undefined || spec === undefined || spec.readOnly === true) return false;
    const field = spec.field;
    let edited = this.originals.get(record);
    if (edited === undefined) {
      edited = new Map();
      this.originals.set(record, edited);
    }
    if (!edited.has(field)) edited.set(field, record[field]);
    (record as Record<string, unknown>)[field] = value;
    if (Object.is(edited.get(field), value)) {
      edited.delete(field);
      if (edited.size === 0) this.originals.delete(record);
    }
    return true;
  }

  parse(_row: number, column: number, text: string): ParsedCell {
    const spec = this.columns[column];
    if (spec === undefined) return null;
    if (spec.parse !== undefined) return spec.parse(text);
    const trimmed = text.trim();
    if (trimmed === "") return { value: null };
    const type = spec.type ?? (typeof this.records.find((record) => record[spec.field] != null)?.[spec.field] === "number" ? "number" : "text");
    if (type === "text") return { value: text };
    return INVARIANT_NUMBER.test(trimmed) ? { value: Number(trimmed) } : null;
  }

  text(row: number, column: number): string {
    const value = this.valueAt(row, column);
    if (value === undefined || value === null) return "";
    const format = this.columns[column]?.format;
    return format !== undefined ? format(value) : String(value);
  }

  /** The records edited since they were loaded (or since `accept()`), in row order, each with its patch. */
  changes(): RecordChange<T>[] {
    const changes: RecordChange<T>[] = [];
    this.records.forEach((record, index) => {
      const edited = this.originals.get(record);
      if (edited === undefined) return;
      const values: Partial<T> = {};
      for (const field of edited.keys()) values[field] = record[field];
      changes.push({ record, index, values });
    });
    return changes;
  }

  /** Whether a record has an edit not yet accepted. */
  get dirty(): boolean {
    return this.originals.size > 0;
  }

  /** Takes the current values as saved: the app stored the changes. */
  accept(): void {
    this.originals.clear();
  }
}

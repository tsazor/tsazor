/**
 * The pivot's model (design-extended-library.md §2.5): the matrix a pivot
 * grid shows — rows by a row field's values, columns by a column field's,
 * the measure's aggregate over each cell, and the totals (per row, per
 * column, and the grand one). Headless and dependency-free; the skins render
 * the matrix through their DataGrid (the sort and the paging over the matrix's
 * rows, the totals as the grid's footer) or as they like.
 */

/** The measure: the value a cell aggregates, the aggregate's kind, and the format the cells show. */
export interface PivotMeasure<T> {
  /** The measure's value of a row (numbers and nulls; a count measure ignores it). */
  value: (row: T) => number | null | undefined;
  /** The aggregate over the measure's values in a cell (default: sum; a custom one takes the values). */
  aggregate?: PivotAggregate | ((values: readonly number[]) => number | undefined);
  /** Formats a cell (and a total); default: the value as text, an empty aggregate as empty text. */
  format?: (value: number | null | undefined) => string;
}

/** The built-in aggregates of a measure, as the grid's are. */
export type PivotAggregate = "sum" | "avg" | "count" | "min" | "max";

/** One of the matrix's row lines: its dimension's value, the measure per column value, its total. */
export interface PivotRow {
  /** The row's dimension value (a key of the row order). */
  value: unknown;
  /** The measure's value per column, in the matrix's column order (undefined: nothing there). */
  cells: (number | undefined)[];
  /** The row's total over all the column values. */
  total: number | undefined;
}

/** The matrix the skins render. */
export interface PivotMatrix<T = unknown> {
  /** The column values in their order (a key of the column order). */
  columns: readonly unknown[];
  /** The rows in their order. */
  rows: readonly PivotRow[];
  /** The column totals in the columns' order, and the grand total. */
  totals: { cells: (number | undefined)[]; grand: number | undefined };
}

/** A dimension's value as the matrix's order key: numbers and text as they are; booleans "true"/"false". */
function matrixKey(value: unknown): string {
  return typeof value === "object" && value !== null ? "[object]" : String(value);
}

/** Aggregates the value list (the same shapes the grid's aggregates use); none: the sum. */
function aggregateOf(kind: PivotAggregate | ((values: readonly number[]) => number | undefined) | undefined, values: readonly number[]): number | undefined {
  if (kind !== undefined && typeof kind === "function") return kind(values);
  const known = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  // A set without any number aggregates to nothing (the cells' empty says the same).
  if (kind !== "count" && known.length === 0) return undefined;
  switch (kind ?? "sum") {
    case "count": return values.length;
    case "avg": return known.length === 0 ? undefined : known.reduce((sum, value) => sum + value, 0) / known.length;
    case "min": return known.length === 0 ? undefined : known.reduce((low, value) => (value < low ? value : low), known[0]!);
    case "max": return known.length === 0 ? undefined : known.reduce((high, value) => (value > high ? value : high), known[0]!);
    default: return known.reduce((sum, value) => sum + value, 0);
  }
}

/** A dimension's key's collation (numeric-aware text, "2" before "10"). */
const pivotCollator = new Intl.Collator(undefined, { numeric: true });

/**
 * The pivot's compute: a matrix's factory (the fields and the measure), applied to data. Build
 * one (a field of the app) and feed data; the class holds no state between computes.
 */
export class PivotModel<T> {
  private readonly rows: (row: T) => unknown;
  private readonly columns: ((row: T) => unknown) | undefined;
  private readonly measure: PivotMeasure<T>;
  private readonly aggregate: Exclude<PivotMeasure<T>["aggregate"], undefined>;

  constructor(options: {
    /** The row field's values (a dimension): `(order) => order.quarter`. */
    rows: (row: T) => unknown;
    /** The column field's values (a dimension): `(order) => order.region`. Without one: one column. */
    columns?: (row: T) => unknown;
    /** The measure: the values a cell aggregates, their aggregate's kind and the format. */
    measure: PivotMeasure<T>;
  }) {
    if (options.rows === undefined) throw new Error("PivotModel: a pivot needs its rows field.");
    this.rows = options.rows;
    this.columns = options.columns;
    this.measure = options.measure;
    this.aggregate = options.measure.aggregate ?? "sum";
  }

  /** The measure's formatted text for a cell: the measure's format decides (the empty's "–" is its call); the default: the value as text. */
  format(value: number | null | undefined): string {
    if (this.measure.format !== undefined) return this.measure.format(value);
    return value === null || value === undefined ? "" : String(value);
  }

  /**
   * The matrix for the data: the dimensions' orders (the collator's order, a stable one across
   * computes), the measure per cell, and the totals (per row, per column, the grand one).
   */
  compute(data: readonly T[]): PivotMatrix<T> {
    const rowValues = new Map<string, unknown>();
    const columnValues = new Map<string, unknown>();
    /** A cell's measure values, by the row key then the column key. */
    const buckets = new Map<string, Map<string, number[]>>();
    for (const row of data) {
      const rowValue = this.rows(row);
      const columnValue = this.columns === undefined ? "" : this.columns(row);
      const rowKey = matrixKey(rowValue);
      const columnKey = matrixKey(columnValue);
      rowValues.set(rowKey, rowValue);
      columnValues.set(columnKey, columnValue);
      let within = buckets.get(rowKey);
      if (within === undefined) buckets.set(rowKey, (within = new Map()));
      const bucket = within.get(columnKey) ?? [];
      const measure = this.measure.value(row);
      // A row without a measure's number still counts (a count over its cell): the placeholder's NaN.
      bucket.push(typeof measure === "number" && Number.isFinite(measure) ? measure : NaN);
      within.set(columnKey, bucket);
    }
    const ordered = (keys: readonly string[]): string[] => [...keys].sort(pivotCollator.compare);
    const columnKeys = ordered([...columnValues.keys()]);
    const rowKeys = ordered([...rowValues.keys()]);
    const cellOf = (values: number[] | undefined): number | undefined => (values === undefined ? undefined : aggregateOf(this.aggregate, values));
    /** A total's value (a count counts the rows that fit; an empty set has no total). */
    const totalOf = (fits: (row: T) => boolean): number | undefined => {
      if (this.aggregate === "count") return data.filter(fits).length;
      const values = data.filter(fits).map((row) => this.measure.value(row)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return values.length === 0 ? undefined : cellOf(values);
    };
    return {
      columns: columnKeys.map((key) => columnValues.get(key)),
      rows: rowKeys.map((rowKey) => ({
        value: rowValues.get(rowKey)!,
        cells: columnKeys.map((columnKey) => cellOf(buckets.get(rowKey)?.get(columnKey))),
        total: totalOf((row) => matrixKey(this.rows(row)) === rowKey),
      })),
      totals: {
        cells: columnKeys.map((columnKey) => totalOf((row) => matrixKey(this.columns === undefined ? "" : this.columns(row)) === columnKey)),
        grand: totalOf(() => true),
      },
    };
  }
}
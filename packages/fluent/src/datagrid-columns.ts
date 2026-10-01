/**
 * Column description for the templated `DataGrid`. Declared outside `@code`
 * (the compiler's `@code` body only holds class members); DataGrid imports it
 * via `@import type`.
 */
export interface DataGridColumn<TRow> {
  /** The row property name the cell defaults to (or the column's key). */
  field: string;
  /** Header text; defaults to `field`. */
  title?: string;
  /** Formats the cell text from the row (instead of `String(row[field])`). */
  format?: (row: TRow) => string;
  /** Cell/header text alignment: start (default) | center | end. */
  align?: "start" | "center" | "end";
}
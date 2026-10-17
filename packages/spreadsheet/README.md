# @tsazor/spreadsheet

The model of a spreadsheet for Tsazor apps: cells in A1 notation, ranges, an undo stack, copy and paste — headless
and dependency-free. Part of Tsazor's extended line (post-1.0; the API may still change). Formulas come later, as a
package of their own (D-X4); the rendered sheet comes on top of this model.

See [`docs/design-extended-library.md`](https://github.com/tsazor/tsazor/blob/main/docs/design-extended-library.md) §2.6 and D-X11.

The values live in a source. A data-driven app edits the records it loaded from its backend, as in Excel, and saves
what changed:

```ts
import { RecordSheetSource, SheetModel } from "@tsazor/spreadsheet";

const source = new RecordSheetSource(invoices, [
  { field: "id", title: "No.", readOnly: true },
  { field: "customer" },
  { field: "amount", type: "number" },
]);
const sheet = new SheetModel(() => this.stateHasChanged(), source);

await sheet.setTextAsync("C2", "150");          // invoices[1].amount = 150
await sheet.pasteTextAsync("B1", clipboardText); // a range copied in Excel: one undo step
await sheet.undoAsync();

for (const { record, values } of source.changes()) await api.patchInvoice(record.id, values);
source.accept();
```

- **`SheetModel`** — the selection (`select`, `isSelected`), the values (`valueOf`, `textOf`, `setAsync`,
  `setTextAsync`), the undo stack (`undoAsync`, `redoAsync`; a paste is one step), copy and paste within the sheet
  (`copy`, `pasteAsync`) and as TSV text for the system clipboard (`copyText`, `pasteTextAsync` — the chrome or the
  app hands it to the `copy`/`paste` events).
- **`RecordSheetSource`** — a row per record, a column per property: read-only columns, a column's type
  (`"number"` reads `1234.5`) or its own `parse`/`format` (a culture's numbers, a `Decimal`). It edits the records in
  place; `changes()` are the per-record patches since the load or `accept()`.
- **`FreeSheetSource`** — any cell holds text or a number; optionally bounded (`{ rows, columns }`).
- **`parseTsv`/`formatTsv`** — the clipboard text spreadsheets exchange (tabs, line breaks, quoted cells).

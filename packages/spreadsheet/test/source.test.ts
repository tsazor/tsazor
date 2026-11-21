/**
 * The sheet's sources (D-X11) and TSV text: a record sheet edits the app's records in place and hands back what
 * changed as patches; a paste from Excel reads each text as its column reads it; a free sheet reads numbers.
 */
import { describe, expect, it, vi } from "vitest";
import { FreeSheetSource, RecordSheetSource, SheetModel, formatTsv, parseTsv, type SheetColumn } from "../src/index";

interface Invoice {
  id: number;
  customer: string;
  amount: number;
  note?: string | null;
}

const columns: SheetColumn<Invoice>[] = [
  { field: "id", title: "No.", readOnly: true },
  { field: "customer" },
  { field: "amount", type: "number" },
  { field: "note" },
];

function invoices(): Invoice[] {
  return [
    { id: 1, customer: "Ada", amount: 120, note: null },
    { id: 2, customer: "Grace", amount: 80, note: "late" },
    { id: 3, customer: "Edsger", amount: 45.5 },
  ];
}

describe("TSV text", () => {
  it("reads Excel's clipboard: tabs, line breaks, quoted cells with tabs, breaks and doubled quotes", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseTsv('"x\ty"\t"say ""hi"""\n"two\nlines"\t\n')).toEqual([["x\ty", 'say "hi"'], ["two\nlines", ""]]);
    expect(parseTsv("one")).toEqual([["one"]]);
    expect(parseTsv("")).toEqual([]);
    // A lone quote inside a cell is text.
    expect(parseTsv('5" disk\t1')).toEqual([['5" disk', "1"]]);
  });

  it("writes it back the same way", () => {
    const rows = [["x\ty", 'say "hi"'], ["two\nlines", ""]];
    expect(formatTsv(rows)).toBe('"x\ty"\t"say ""hi"""\r\n"two\nlines"\t\r\n');
    expect(parseTsv(formatTsv(rows))).toEqual(rows);
  });
});

describe("a record sheet", () => {
  it("shows a row per record and a column per property; A1 addresses them", () => {
    const sheet = new SheetModel(() => undefined, new RecordSheetSource(invoices(), columns));
    expect(sheet.valueOf("B2")).toBe("Grace");
    expect(sheet.valueOf("C3")).toBe(45.5);
    expect(sheet.valueOf("D1")).toBeNull();
    expect(sheet.source.rowCount).toBe(3);
    expect(sheet.source.columnCount).toBe(4);
  });

  it("edits the records in place and hands back the patches; an edit undone is no change", async () => {
    const records = invoices();
    const source = new RecordSheetSource(records, columns);
    const sheet = new SheetModel(() => undefined, source);
    expect(await sheet.setTextAsync("C1", "150")).toBe(true);
    expect(await sheet.setTextAsync("B2", "Grace H.")).toBe(true);
    expect(records[0]!.amount).toBe(150);
    expect(source.dirty).toBe(true);
    expect(source.changes()).toEqual([
      { record: records[0], index: 0, values: { amount: 150 } },
      { record: records[1], index: 1, values: { customer: "Grace H." } },
    ]);
    await sheet.undoAsync();
    expect(records[1]!.customer).toBe("Grace");
    expect(source.changes().map((change) => change.index)).toEqual([0]);
    // Typed back to the old value: no change either.
    await sheet.setTextAsync("C1", "120");
    expect(source.dirty).toBe(false);
  });

  it("refuses what a column can't take: a read-only column, text in a number column; empty is null", async () => {
    const records = invoices();
    const sheet = new SheetModel(() => undefined, new RecordSheetSource(records, columns));
    expect(await sheet.setTextAsync("A1", "9")).toBe(false);
    expect(await sheet.setTextAsync("C1", "a lot")).toBe(false);
    expect(records[0]).toEqual({ id: 1, customer: "Ada", amount: 120, note: null });
    expect(await sheet.setTextAsync("D2", "")).toBe(true);
    expect(records[1]!.note).toBeNull();
    expect(await sheet.setAsync("A9", 1)).toBe(false);
  });

  it("pastes from Excel as one step: each text read by its column, the refused ones counted, the sheet's edge clipping", async () => {
    const records = invoices();
    const onChange = vi.fn();
    const source = new RecordSheetSource(records, columns);
    const sheet = new SheetModel(onChange, source);
    const result = await sheet.pasteTextAsync("B2", "Lin\t99,5\r\nKay\t60\r\nMore\t1\r\n");
    // 99,5 is no invariant number; the third row has no record.
    expect(result).toEqual({ written: 3, refused: 3 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(records.map((record) => [record.customer, record.amount])).toEqual([["Ada", 120], ["Lin", 80], ["Kay", 60]]);
    await sheet.undoAsync();
    expect(records.map((record) => [record.customer, record.amount])).toEqual([["Ada", 120], ["Grace", 80], ["Edsger", 45.5]]);
    expect(source.dirty).toBe(false);
  });

  it("takes a column's own reading and text: a culture's numbers in, its form out", async () => {
    const records = invoices();
    const german: SheetColumn<Invoice>[] = [
      columns[0]!,
      columns[1]!,
      {
        field: "amount",
        parse: (text) => (/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(text.trim()) ? { value: Number(text.trim().replace(/\./g, "").replace(",", ".")) } : null),
        format: (value) => String(value).replace(".", ","),
      },
    ];
    const sheet = new SheetModel(() => undefined, new RecordSheetSource(records, german));
    expect(await sheet.pasteTextAsync("C1", "1.234,5\r\n99,5\r\n")).toEqual({ written: 2, refused: 0 });
    expect(records.map((record) => record.amount)).toEqual([1234.5, 99.5, 45.5]);
    sheet.select("B1", "C3");
    expect(sheet.copyText()).toBe("Ada\t1234,5\r\nGrace\t99,5\r\nEdsger\t45,5\r\n");
  });

  it("accept() takes the current values as saved", async () => {
    const source = new RecordSheetSource(invoices(), columns);
    const sheet = new SheetModel(() => undefined, source);
    await sheet.setTextAsync("B3", "E. W. Dijkstra");
    source.accept();
    expect(source.changes()).toEqual([]);
    await sheet.undoAsync();
    expect(source.changes()[0]!.values).toEqual({ customer: "Edsger" });
  });
});

describe("the free sheet", () => {
  it("reads a pasted number as one, anything else as text, empty as empty", async () => {
    const sheet = new SheetModel(() => undefined);
    expect(await sheet.pasteTextAsync("A1", "12\t1.5e3\tabc\r\n\t-0.5\t007x\r\n")).toEqual({ written: 5, refused: 0 });
    expect(sheet.selectedValues()).toEqual({ addresses: [], values: [] });
    sheet.select("A1", "C2");
    expect(sheet.selectedValues().values).toEqual([12, 1500, "abc", undefined, -0.5, "007x"]);
    expect(sheet.copyText()).toBe("12\t1500\tabc\r\n\t-0.5\t007x\r\n");
  });

  it("clips a paste at a bounded sheet's edge", async () => {
    const sheet = new SheetModel(() => undefined, new FreeSheetSource({ rows: 2, columns: 2 }));
    expect(await sheet.pasteTextAsync("B2", "a\tb\r\nc\td\r\n")).toEqual({ written: 1, refused: 3 });
    expect(sheet.valueOf("B2")).toBe("a");
  });
});

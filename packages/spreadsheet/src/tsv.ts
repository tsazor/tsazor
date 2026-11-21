/**
 * Tab-separated text, as spreadsheets put a range on the clipboard (Excel, LibreOffice, Google Sheets): rows end
 * with a line break, cells with a tab; a cell holding a tab, a line break or a quote is quoted, its quotes doubled.
 */

/** The rows of a TSV text, each its cells' texts. A trailing line break ends the last row, it adds none. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    if (cell === "" && character === '"' && text.indexOf('"', index + 1) >= 0) {
      // A quoted cell: up to the quote that isn't doubled.
      index++;
      while (index < text.length) {
        if (text[index] === '"') {
          if (text[index + 1] === '"') {
            cell += '"';
            index += 2;
            continue;
          }
          index++;
          break;
        }
        cell += text[index++];
      }
      continue;
    }
    if (character === "\t") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (character === "\r" && text[index + 1] === "\n") index++;
    } else {
      cell += character;
    }
    index++;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** TSV text of rows of cell texts, each row ending with a line break (`\r\n`, as Excel writes it). */
export function formatTsv(rows: readonly (readonly string[])[]): string {
  const quoted = (cell: string): string => (/[\t\r\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map((row) => `${row.map(quoted).join("\t")}\r\n`).join("");
}

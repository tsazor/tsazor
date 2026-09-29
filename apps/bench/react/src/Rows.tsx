import { useEffect, useRef, useState } from "react";
import { markBenchReady, type BenchRow } from "./bench-model";

export function RowsPage() {
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [selectedId, setSelectedId] = useState<number>(-1);

  // ready marker: after the initial state resolved and first view rendered
  useEffect(markBenchReady, []);

  const rowClass = (row: BenchRow) => (row.id === selectedId ? "selected" : "");
  // random 6-digit ids, globally unique — kept outside the component body so
  // it survives React's re-renders (a fresh Set per render would re-issue
  // already-used ids on append and break keyed reconciliation)
  const usedIdsRef = useRef(new Set<number>());
  const makeRows = (count: number): BenchRow[] => {
    const made: BenchRow[] = [];
    for (let i = 0; i < count; i++) {
      let id: number;
      do {
        id = 100000 + Math.floor(Math.random() * 900000);
      } while (usedIdsRef.current.has(id));
      usedIdsRef.current.add(id);
      made.push({ id, label: `item #${id}` });
    }
    return made;
  };

  return (
    <section className="rowsbench">
      <div className="rows-toolbar">
        <button onClick={() => setRows(makeRows(10000))}>create 10,000 rows</button>
        <button onClick={() => setRows([...rows, ...makeRows(1000)])}>append 1,000 rows</button>
        <button onClick={() => setRows(rows.map((row, i) => (i % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row)))}>
          update every 10th row
        </button>
        <button onClick={() => setRows([rows[1], rows[0], ...rows.slice(2)])}>swap rows</button>
      </div>
      <p className="rows-linecount" role="status" aria-live="polite">
        {rows.length} lines
      </p>
      <table className="rows-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={rowClass(row)}>
              <td className="col-id">{row.id}</td>
              <td className="col-title" onClick={() => setSelectedId(row.id)}>
                {row.label}
              </td>
              <td className="col-remove" onClick={() => setRows(rows.filter((r) => r.id !== row.id))}>
                <span aria-hidden="true">x</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
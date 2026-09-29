/** Shared bench helpers for the React port (spec-identical logic). */

export interface TodoItem {
  id: number;
  title: string;
  completed: boolean;
}

export const STORAGE_KEY = "bench-todo-mvc";

export function loadTodos(): TodoItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return Array.isArray(parsed)
      ? parsed.map((t) => ({ id: Number(t.id), title: String(t.title), completed: Boolean(t.completed) }))
      : [];
  } catch {
    return [];
  }
}

export function saveTodos(todos: TodoItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    /* storage unavailable — tolerated */
  }
}

/** Random 6-digit row id like the js-framework-benchmark rows benchmark —
 *  but globally unique: collisions at 10k+ rows are statistically certain
 *  and make "remove one row" ambiguous. */
const usedRowIds = new Set<number>();
export function nextRowId(): number {
  for (;;) {
    const id = 100000 + Math.floor(Math.random() * 900000);
    if (!usedRowIds.has(id)) {
      usedRowIds.add(id);
      return id;
    }
  }
}

export interface BenchRow {
  id: number;
  label: string;
}

export function makeRows(count: number): BenchRow[] {
  const rows: BenchRow[] = [];
  for (let i = 0; i < count; i++) {
    const id = nextRowId();
    rows.push({ id, label: `item #${id}` });
  }
  return rows;
}

/** Bench marker: after the framework mounted its first view (identical protocol in all 5 apps). */
export function markBenchReady(): void {
  (window as { __benchReadyAt?: number }).__benchReadyAt = performance.now();
}
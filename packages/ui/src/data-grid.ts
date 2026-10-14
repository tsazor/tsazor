import type { RenderFragment } from "@tsazor/runtime";

/**
 * The DataGrid core (design-component-library.md §5): what both skins share —
 * sorting (`GridSort`), paging (`PaginationState`), the `ItemsProvider`
 * contract and the `DataGridModel` that collects the columns and computes the
 * rows. Modeled on Blazor's QuickGrid; no DOM here.
 */

/** A sort direction; `auto` toggles (ascending first, or the column's initial direction). */
export type SortDirection = "auto" | "ascending" | "descending";

/** Cell and header alignment of a column. */
export type ColumnAlign = "start" | "center" | "end";

type SortKey<T> = (item: T) => unknown;

/**
 * How a column sorts: QuickGrid's `GridSort<T>`.
 * `GridSort.byAscending((o: Order) => o.customer).thenDescending((o) => o.total)`.
 * Flipping the column's direction flips every step.
 */
export class GridSort<T> {
  private constructor(private readonly steps: ReadonlyArray<{ key: SortKey<T>; ascending: boolean }>) {}

  /** Sorts by `key`, smallest first. */
  static byAscending<T>(key: (item: T) => unknown): GridSort<T> {
    return new GridSort<T>([{ key, ascending: true }]);
  }

  /** Sorts by `key`, largest first. */
  static byDescending<T>(key: (item: T) => unknown): GridSort<T> {
    return new GridSort<T>([{ key, ascending: false }]);
  }

  /** Then (for equal keys so far) by `key`, smallest first. */
  thenAscending(key: (item: T) => unknown): GridSort<T> {
    return new GridSort<T>([...this.steps, { key, ascending: true }]);
  }

  /** Then (for equal keys so far) by `key`, largest first. */
  thenDescending(key: (item: T) => unknown): GridSort<T> {
    return new GridSort<T>([...this.steps, { key, ascending: false }]);
  }

  /** A sorted copy (stable); `ascending: false` reverses every step. */
  apply(items: readonly T[], ascending = true): T[] {
    const indexed = items.map((item, index) => ({ item, index }));
    indexed.sort((a, b) => {
      for (const step of this.steps) {
        const order = compareValues(step.key(a.item), step.key(b.item));
        if (order !== 0) return step.ascending === ascending ? order : -order;
      }
      return a.index - b.index;
    });
    return indexed.map((entry) => entry.item);
  }
}

const collator = new Intl.Collator(undefined, { numeric: true });

/** Orders two sort keys: numbers, bigints, dates and booleans by value, text by the user's collation; null/undefined last. */
export function compareValues(a: unknown, b: unknown): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if ((typeof a === "number" || typeof a === "bigint") && (typeof b === "number" || typeof b === "bigint")) return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return collator.compare(String(a), String(b));
}

/** What a `PaginationState` reports to its subscribers. */
export type PaginationChange = "page" | "total";

/**
 * Paging state shared by a grid and its `Paginator`: QuickGrid's
 * `PaginationState`. Create one per grid (`pagination = new PaginationState()`),
 * pass it to both.
 */
export class PaginationState {
  /** Rows per page. Set it before the first render; later, `setItemsPerPageAsync` reloads the grid. */
  itemsPerPage = 10;
  private pageIndex = 0;
  private total: number | undefined;
  private readonly listeners = new Set<(change: PaginationChange) => void>();

  /** The current page, 0-based. */
  get currentPageIndex(): number {
    return this.pageIndex;
  }

  /** All rows across all pages; undefined until the grid has loaded. */
  get totalItemCount(): number | undefined {
    return this.total;
  }

  /** The last page, 0-based; undefined until the total is known. */
  get lastPageIndex(): number | undefined {
    return this.total === undefined ? undefined : Math.max(0, Math.ceil(this.total / this.itemsPerPage) - 1);
  }

  /** Goes to a page (clamped to the known pages); the grid loads it. */
  async setCurrentPageIndexAsync(pageIndex: number): Promise<void> {
    const last = this.lastPageIndex;
    const next = Math.max(0, last === undefined ? pageIndex : Math.min(pageIndex, last));
    if (next === this.pageIndex) return;
    this.pageIndex = next;
    this.notify("page");
  }

  /**
   * Changes the rows per page and goes back to the first page; the grid loads it (MudBlazor's `SetRowsPerPage`,
   * the Paginator's `pageSizeOptions`). Setting `itemsPerPage` alone, as QuickGrid's property, takes effect on the
   * grid's next load.
   */
  async setItemsPerPageAsync(itemsPerPage: number): Promise<void> {
    if (!Number.isInteger(itemsPerPage) || itemsPerPage < 1) {
      throw new RangeError(`itemsPerPage must be a positive whole number, not ${itemsPerPage}.`);
    }
    if (itemsPerPage === this.itemsPerPage) return;
    this.itemsPerPage = itemsPerPage;
    this.pageIndex = 0;
    this.notify("page");
  }

  /** @internal The grid reports the total after loading; the page moves back when it ran past the end. */
  setTotalItemCount(count: number): void {
    if (count === this.total) return;
    this.total = count;
    const last = this.lastPageIndex!;
    const moved = this.pageIndex > last;
    if (moved) this.pageIndex = last;
    this.notify("total");
    if (moved) this.notify("page");
  }

  /** Calls `listener` on every change; returns the unsubscribe function (`observe` in a component). */
  subscribe(listener: (change?: PaginationChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(change: PaginationChange): void {
    for (const listener of [...this.listeners]) listener(change);
  }
}

/** One sort property of a request, for a server: the column's `sortKey`. */
export interface SortedProperty {
  propertyName: string;
  direction: "ascending" | "descending";
}

/** What a grid asks its `ItemsProvider` for: QuickGrid's `GridItemsProviderRequest<T>`. */
export interface GridItemsProviderRequest<T> {
  /** The first row, 0-based. */
  startIndex: number;
  /** How many rows; undefined for all. */
  count: number | undefined;
  /** The column the user sorted by. */
  sortByColumn: GridColumn<T> | undefined;
  sortByAscending: boolean;
  /** Aborted when the grid needs other rows before these arrived. */
  signal: AbortSignal;
  /** Sorts `source` like the grid would (for providers that hold the rows themselves). */
  applySorting(source: readonly T[]): T[];
  /** The sort as property names (the column's `sortKey`), for a server query. */
  getSortByProperties(): SortedProperty[];
}

/** An `ItemsProvider`'s answer: one page of rows and the count of all. */
export interface GridItemsProviderResult<T> {
  items: T[];
  totalItemCount: number;
}

/** Loads rows on demand (server-side paging and sorting): QuickGrid's `GridItemsProvider<T>`. */
export type GridItemsProvider<T> = (request: GridItemsProviderRequest<T>) => Promise<GridItemsProviderResult<T>> | GridItemsProviderResult<T>;

/** A column as the grid sees it: what a skin's column component registers on each render. */
export interface GridColumn<T> {
  /** The column component — the column's identity across renders. */
  readonly owner: object;
  title: string;
  /** The header content instead of the title. */
  headerContent?: RenderFragment;
  /** The cell of a row. */
  cell: (item: T) => RenderFragment;
  sortable: boolean;
  sortBy?: GridSort<T>;
  /** The property name a server sorts by (`getSortByProperties`). */
  sortKey?: string;
  initialSortDirection?: "ascending" | "descending";
  isDefaultSortColumn?: boolean;
  align?: ColumnAlign;
  /** Extra class for the column's cells. */
  className?: string;
}

/** Row selection: none, one row, or any number of rows. */
export type SelectionMode = "none" | "single" | "multiple";

/** Where the grid's rows come from. */
export interface GridSource<T> {
  items?: readonly T[];
  itemsProvider?: GridItemsProvider<T>;
  pagination?: PaginationState;
}

/**
 * The grid's state: its columns (collected on every render, in markup order,
 * like QuickGrid), the sort, the rows of the current page and the loading
 * state. A skin's grid creates one, cascades it to its columns and renders
 * `columns` and `rows`; `onChange` asks the grid to render again.
 */
export class DataGridModel<T> {
  private collecting: GridColumn<T>[] | undefined;
  private current: GridColumn<T>[] = [];
  private sortOwner: object | undefined;
  private ascending = true;
  private defaultSortApplied = false;
  private source: GridSource<T> = {};
  private view: { key: readonly unknown[]; rows: readonly T[] } | undefined;
  private provided: readonly T[] = [];
  private loadingNow = false;
  private abort: AbortController | undefined;
  private unsubscribe: (() => void) | undefined;
  private virtualRefresh: (() => Promise<void>) | undefined;
  private sortedView: { key: readonly unknown[]; rows: readonly T[] } | undefined;

  constructor(private readonly onChange: () => void) {}

  /* Columns ----------------------------------------------------------------- */

  /** The columns of the last render, in markup order. */
  get columns(): readonly GridColumn<T>[] {
    return this.current;
  }

  /** Starts a render's column collection (before the grid's child content). */
  startCollectingColumns(): void {
    this.collecting = [];
  }

  /** A column registers itself while it renders. */
  addColumn(column: GridColumn<T>): void {
    if (this.collecting === undefined) return;
    this.collecting.push(column);
    if (!this.defaultSortApplied && this.sortOwner === undefined && column.isDefaultSortColumn) {
      this.sortOwner = column.owner;
      this.ascending = column.initialSortDirection !== "descending";
    }
  }

  /** Ends the collection (after the child content rendered); true when the default sort was just applied. */
  finishCollectingColumns(): boolean {
    if (this.collecting !== undefined) this.current = this.collecting;
    this.collecting = undefined;
    const applied = !this.defaultSortApplied && this.sortOwner !== undefined;
    this.defaultSortApplied = true;
    return applied;
  }

  /* Sorting ----------------------------------------------------------------- */

  /** The column sorted by, if any. */
  get sortColumn(): GridColumn<T> | undefined {
    return this.sortOwner === undefined ? undefined : this.current.find((column) => column.owner === this.sortOwner);
  }

  /** The direction of `column` when the grid is sorted by it. */
  sortDirectionOf(column: GridColumn<T>): "ascending" | "descending" | undefined {
    return column.owner === this.sortOwner ? (this.ascending ? "ascending" : "descending") : undefined;
  }

  /** Sorts by `column` (QuickGrid's `SortByColumnAsync`); `auto` toggles a sorted column, else starts with its initial direction. */
  async sortByColumnAsync(column: GridColumn<T>, direction: SortDirection = "auto"): Promise<void> {
    if (direction === "auto") {
      this.ascending = column.owner === this.sortOwner ? !this.ascending : column.initialSortDirection !== "descending";
    } else {
      this.ascending = direction === "ascending";
    }
    this.sortOwner = column.owner;
    this.defaultSortApplied = true;
    // A new order starts on the first page (QuickGrid).
    const pagination = this.source.pagination;
    if (pagination && pagination.currentPageIndex !== 0) await pagination.setCurrentPageIndexAsync(0);
    await this.refreshDataAsync();
  }

  /* Rows -------------------------------------------------------------------- */

  /**
   * Sets where the rows come from (the grid's parameters); true when that
   * changed. The model follows the pagination state's page changes.
   */
  setSource(source: GridSource<T>): boolean {
    if (source.items !== undefined && source.itemsProvider !== undefined) {
      throw new Error("DataGrid: set either Items or ItemsProvider, not both.");
    }
    const changed = source.items !== this.source.items || source.itemsProvider !== this.source.itemsProvider || source.pagination !== this.source.pagination;
    if (source.pagination !== this.source.pagination) {
      this.unsubscribe?.();
      this.unsubscribe = source.pagination?.subscribe((change) => {
        if (change === "page") void this.refreshDataAsync();
      });
    }
    this.source = source;
    return changed;
  }

  /** True while an `ItemsProvider` call is running. */
  get loading(): boolean {
    return this.loadingNow;
  }

  /** The rows of the current page, sorted. */
  get rows(): readonly T[] {
    const items = this.source.items;
    if (items === undefined) return this.provided;
    const pagination = this.source.pagination;
    const column = this.sortColumn;
    const key = [items, items.length, column?.owner, this.ascending, pagination?.currentPageIndex, pagination?.itemsPerPage];
    if (this.view === undefined || key.some((part, index) => !Object.is(part, this.view!.key[index]))) {
      const sorted = column?.sortBy ? column.sortBy.apply(items, this.ascending) : [...items];
      pagination?.setTotalItemCount(items.length);
      const rows = pagination ? sorted.slice(pagination.currentPageIndex * pagination.itemsPerPage, (pagination.currentPageIndex + 1) * pagination.itemsPerPage) : sorted;
      this.view = { key, rows };
    }
    return this.view.rows;
  }

  /**
   * Reloads the rows (QuickGrid's `RefreshDataAsync`): with an
   * `ItemsProvider`, a new request (the running one is aborted); with
   * `Items`, a render. Call it when the provider's data changed.
   */
  async refreshDataAsync(): Promise<void> {
    if (this.virtualRefresh !== undefined) {
      this.onChange();
      await this.virtualRefresh();
      return;
    }
    const provider = this.source.itemsProvider;
    if (provider === undefined) {
      this.view = undefined;
      this.onChange();
      return;
    }
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const pagination = this.source.pagination;
    const request = this.request(pagination ? pagination.currentPageIndex * pagination.itemsPerPage : 0, pagination?.itemsPerPage, abort.signal);
    this.loadingNow = true;
    this.onChange();
    try {
      const result = await provider(request);
      if (abort.signal.aborted) return;
      this.provided = result.items;
      pagination?.setTotalItemCount(result.totalItemCount);
    } catch (error) {
      if (abort.signal.aborted) return;
      throw error;
    } finally {
      if (this.abort === abort) {
        this.abort = undefined;
        this.loadingNow = false;
        this.onChange();
      }
    }
  }

  /* Virtualization --------------------------------------------------------- */

  /**
   * Turns virtualization on (`refresh` re-requests the visible window — the
   * skin's Virtualize) or off. A virtualized grid has no pages: it shows all
   * rows, rendering the visible ones.
   */
  setVirtualization(refresh: (() => Promise<void>) | undefined): void {
    if (refresh !== undefined && this.source.pagination !== undefined) {
      throw new Error("DataGrid: Virtualize and Pagination don't combine — a virtualized grid scrolls through all rows.");
    }
    this.virtualRefresh = refresh;
  }

  /** All rows of `Items`, sorted (a virtualized grid renders a window of them). */
  get sortedItems(): readonly T[] {
    const items = this.source.items ?? [];
    const column = this.sortColumn;
    const key = [items, items.length, column?.owner, this.ascending];
    if (this.sortedView === undefined || key.some((part, index) => !Object.is(part, this.sortedView!.key[index]))) {
      this.sortedView = { key, rows: column?.sortBy ? column.sortBy.apply(items, this.ascending) : [...items] };
    }
    return this.sortedView.rows;
  }

  /** One window of rows from the `ItemsProvider`, sorted like the grid (a running window request is aborted). */
  async provideRangeAsync(startIndex: number, count: number, signal?: AbortSignal): Promise<GridItemsProviderResult<T>> {
    const provider = this.source.itemsProvider;
    if (provider === undefined) return { items: [], totalItemCount: 0 };
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    // The caller (Virtualize) aborts a window it no longer needs: the provider's request aborts with it.
    if (signal?.aborted) abort.abort(signal.reason);
    else signal?.addEventListener("abort", () => abort.abort(signal.reason), { once: true, signal: abort.signal });
    try {
      const result = await provider(this.request(startIndex, count, abort.signal));
      abort.signal.throwIfAborted();
      return result;
    } finally {
      if (this.abort === abort) this.abort = undefined;
    }
  }

  private request(startIndex: number, count: number | undefined, signal: AbortSignal): GridItemsProviderRequest<T> {
    const column = this.sortColumn;
    const ascending = this.ascending;
    return {
      startIndex,
      count,
      sortByColumn: column,
      sortByAscending: ascending,
      signal,
      applySorting: (source) => (column?.sortBy ? column.sortBy.apply(source, ascending) : [...source]),
      getSortByProperties: () => (column?.sortKey ? [{ propertyName: column.sortKey, direction: ascending ? "ascending" : "descending" }] : []),
    };
  }

  /** Stops following the pagination state and aborts a running request. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.abort?.abort();
  }
}

/** The selection after a click on `item`'s selector: `single` replaces, `multiple` toggles. */
export function toggleSelection<T>(selected: readonly T[], item: T, mode: SelectionMode): T[] {
  if (mode === "none") return [...selected];
  const isSelected = selected.includes(item);
  if (mode === "single") return isSelected ? [] : [item];
  return isSelected ? selected.filter((candidate) => candidate !== item) : [...selected, item];
}

/** The selection after the "select all" checkbox: all of `rows` added, or (all selected already) removed. */
export function toggleAll<T>(selected: readonly T[], rows: readonly T[]): T[] {
  const all = rows.length > 0 && rows.every((row) => selected.includes(row));
  return all ? selected.filter((item) => !rows.includes(item)) : [...selected, ...rows.filter((row) => !selected.includes(row))];
}

/** A column's title from its property lambda: `(o) => o.customer.name` ⇒ "name" (QuickGrid takes the member name). */
export function propertyTitle(property: (item: never) => unknown): string | undefined {
  return propertyPath(property)?.split(".").pop();
}

/** The member path of a property lambda: `(o) => o.customer.name` ⇒ "customer.name"; undefined for anything else. */
export function propertyPath(property: (item: never) => unknown): string | undefined {
  const match = /^\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*([A-Za-z_$][\w$]*)((?:\s*\??\.\s*[A-Za-z_$][\w$]*)+)\s*$/.exec(Function.prototype.toString.call(property));
  if (!match) return undefined;
  const parameter = match[1] ?? match[2];
  if (match[3] !== parameter) return undefined;
  return match[4]!.replace(/\s|\?/g, "").slice(1);
}

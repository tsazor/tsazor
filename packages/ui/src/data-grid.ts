import type { RenderFragment } from "@tsazor/runtime";

/**
 * The DataGrid core (design-component-library.md §5, extended per
 * design-extended-library.md §2.1): what both skins share — sorting
 * (`GridSort`), filtering (`GridFilterRule`), paging (`PaginationState`), the
 * `ItemsProvider` contract and the `DataGridModel` that collects the columns
 * and computes the rows. Modeled on Blazor's QuickGrid; no DOM here.
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
  /** The active filters as property names (the columns' `filterKey`), for a server query. */
  getFilterByProperties(): FilteredProperty[];
}

/** An `ItemsProvider`'s answer: one page of rows and the count of all. */
export interface GridItemsProviderResult<T> {
  items: readonly T[];
  totalItemCount: number;
}

/** The operators a column filter supports. */
export type GridFilterOperator =
  /** The filter text appears anywhere in the value (lower case doesn't matter). */
  | "contains"
  /** The filter text appears nowhere in the value. */
  | "notContains"
  /** The value starts with the filter text, case doesn't matter. */
  | "startsWith"
  /** The value ends with the filter text. */
  | "endsWith"
  /** Same value (as text, lower case; a number column filters numerically). */
  | "equals"
  /** Another value. */
  | "notEquals"
  /** Greater than the filter value, by value (numbers, dates), else collation. */
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  /** The value is null, undefined or an empty string. */
  | "empty"
  /** The value holds something. */
  | "notEmpty";

/** A column filter: the operator and its value (undefined for `empty` and `notEmpty`). */
export interface GridFilterRule {
  operator: GridFilterOperator;
  value?: string | number | boolean | Date;
}

/** One active filter, for a server query (`getFilterByProperties`). */
export interface FilteredProperty {
  propertyName: string;
  operator: GridFilterOperator;
  value?: string | number | boolean | Date;
}

/** A filter's target as the text equality matches it: lower case, dates ISO. */
function filterText(value: unknown): string {
  return (value instanceof Date ? value.toISOString() : String(value)).toLowerCase();
}

/** Whether `value` matches `rule`: text case-insensitively, numbers and dates by value. */
export function gridFilterMatches(rule: GridFilterRule, value: unknown): boolean {
  const missing = value === null || value === undefined || value === "";
  if (rule.operator === "empty") return missing;
  if (rule.operator === "notEmpty") return !missing;
  if (missing) return false;
  const target = rule.value ?? "";
  const text = filterText(value);
  switch (rule.operator) {
    case "contains": return text.includes(filterText(target));
    case "notContains": return !text.includes(filterText(target));
    case "startsWith": return text.startsWith(filterText(target));
    case "endsWith": return text.endsWith(filterText(target));
    case "equals": return text === filterText(target);
    case "notEquals": return text !== filterText(target);
    case "greaterThan": return compareValues(value, target) > 0;
    case "greaterThanOrEqual": return compareValues(value, target) >= 0;
    case "lessThan": return compareValues(value, target) < 0;
    case "lessThanOrEqual": return compareValues(value, target) <= 0;
    // Every operator is answered above; the type stays a closed union.
    default: return true;
  }
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
  /** The column's options, shown below the header when the header's options button is clicked (QuickGrid's ColumnOptions). */
  columnOptions?: RenderFragment;
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
  /** Whether the grid offers its built-in filter for the column. */
  filterable?: boolean;
  /** The value the built-in filter tests (a column without one doesn't filter). */
  filterBy?: (item: T) => unknown;
  /** The property name a server filters by (`getFilterByProperties`); default: none filtered server-side. */
  filterKey?: string;
  /** The column's footer summary: a kind over its values, or your own over the rows. */
  aggregate?: GridAggregate<T>;
  /** The values the built-in aggregates read (a PropertyColumn's property). */
  aggregateBy?: (item: T) => unknown;
  /** Formats the aggregate's value for the footer (default: the value as text). */
  aggregateFormat?: (value: unknown) => string;
  /**
   * The cell of a row in the grid's inline edit (the row's columns with one render it instead of
   * their cell; the others stay read-only).
   */
  editContent?: (item: T) => RenderFragment;
}

/** What a footer aggregates over: all the rows the grid holds ("all") or the current page's. */
export type AggregateScope = "all" | "page";

/** The grid's inline editing: none, or a row's edit (one row at a time; its columns with an `editContent` render it). */
export type EditingMode = "none" | "row";

/**
 * One line the grid renders when it groups (the skin loops over `lines`): a data row, or a
 * group's header line — its value (as the group ordered it), how many rows it holds, whether it
 * is open (the open rows follow), and its nesting level (v1: one level, 0).
 */
export type GridRow<T> =
  | { kind: "row"; item: T }
  | { kind: "group"; value: unknown; count: number; open: boolean; depth: number };

/** A column's footer summary: a built-in kind over the column's values, or your own over the rows. */
export type GridAggregate<T> = "sum" | "avg" | "count" | "min" | "max" | ((items: readonly T[]) => unknown);

/**
 * A built-in aggregate over values: `count` their number, `sum` and `avg` the numbers'
 * (other values ignored, no numbers: 0 and undefined), `min` and `max` by value order
 * (numbers, bigints, dates and booleans by value, text by the user's collation).
 */
export function gridAggregate(kind: "sum" | "avg" | "count" | "min" | "max", values: readonly unknown[]): unknown {
  switch (kind) {
    case "count":
      return values.length;
    case "sum":
    case "avg": {
      let sum = 0;
      let numbers = 0;
      for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value)) {
          sum += value;
          numbers++;
        }
      }
      if (kind === "avg") return numbers === 0 ? undefined : sum / numbers;
      return sum;
    }
    case "min":
    case "max": {
      // An order needs a value: numbers, bigints, booleans, text and dates (gridFilterMatches's filterText shapes a date's text).
      const orderable = (value: unknown): boolean => value instanceof Date || (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean");
      const known = values.filter(orderable);
      if (known.length === 0) return undefined;
      let best: unknown = known[0]!;
      for (const value of known.slice(1)) {
        const order = compareValues(value, best);
        if (kind === "min" ? order < 0 : order > 0) best = value;
      }
      return best;
    }
    // The parameter is one of the four kinds above.
    default:
      return undefined;
  }
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
  /** The columns' display order, by their owners: a reorder keeps it across renders. */
  private order: object[] = [];
  private widths = new Map<object, string>();
  private sortOwner: object | undefined;
  private ascending = true;
  private defaultSortApplied = false;
  private source: GridSource<T> = {};
  private view: { key: readonly unknown[]; rows: readonly T[] } | undefined;
  private provided: readonly T[] = [];
  private readonly filters = new Map<object, GridFilterRule>();
  private filterVersion = 0;
  private editedRowItem: T | undefined;
  /** The grouping (by its source, so a re-render's fresh lambda stays the same group). */
  private groupBy: ((item: T) => unknown) | undefined;
  private groupSource: string | undefined;
  /** The collapsed groups, by their value's string (open is the default). */
  private readonly groupCollapsed = new Set<string>();
  private groupVersion = 0;
  private lined?: { key: readonly unknown[]; lines: readonly GridRow<T>[]; indexes: Map<unknown, number> };
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
    // The display order holds over re-renders: its known columns first (in their
    // stored order — a reorder and the widths survive), then the render's fresh
    // ones; a dropped column loses its place.
    const present = new Set(this.current.map((column) => column.owner));
    this.order = [...this.order.filter((owner) => present.has(owner)), ...this.current.map((column) => column.owner).filter((owner) => !this.order.includes(owner))];
    for (const owner of this.widths.keys()) if (!present.has(owner)) this.widths.delete(owner);
    const applied = !this.defaultSortApplied && this.sortOwner !== undefined;
    this.defaultSortApplied = true;
    return applied;
  }

  /* Column order and widths ------------------------------------------------- */

  /**
   * The columns in their display order (the skin's `th`, `col`, `tfoot` and
   * cell loops render this, not `columns`): a reorder keeps it across renders,
   * a markup order the app changes joins its tail.
   */
  get orderedColumns(): readonly GridColumn<T>[] {
    return this.order.length === 0 ? this.current : this.order.map((owner) => this.current.find((column) => column.owner === owner)!).filter((column) => column !== undefined);
  }

  /** The column's display index in the ordered columns. */
  indexOfColumn(column: GridColumn<T>): number {
    return this.orderedColumns.findIndex((entry) => entry.owner === column.owner);
  }

  /** Moves a column to `toIndex` in the display order (clamped; a drag end or the grip's arrow keys); the skin re-renders. */
  moveColumnAsync(column: GridColumn<T>, toIndex: number): void {
    const from = this.indexOfColumn(column);
    if (from === -1 || from === toIndex) return;
    const clamped = Math.max(0, Math.min(this.orderedColumns.length - 1, toIndex));
    if (clamped === from) return;
    this.order.splice(from, 1);
    this.order.splice(clamped, 0, column.owner);
    this.onChange();
  }

  /** The column's width, when one is set (`"240px"`, `"20%"`). */
  widthOf(column: GridColumn<T>): string | undefined {
    return this.widths.get(column.owner);
  }

  /** Sets the column's width (a handle's drag or arrow keys) or clears it; the skin re-renders the col. */
  async setColumnWidthAsync(column: GridColumn<T>, width: string | undefined): Promise<void> {
    const active = this.widths.get(column.owner);
    if (active === width) return;
    if (width === undefined) this.widths.delete(column.owner);
    else this.widths.set(column.owner, width);
    this.onChange();
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
    const key = [items, items.length, column?.owner, this.ascending, pagination?.currentPageIndex, pagination?.itemsPerPage, this.filterVersion];
    if (this.view === undefined || key.some((part, index) => !Object.is(part, this.view!.key[index]))) {
      const filtered = this.filtered(items);
      const sorted = column?.sortBy ? column.sortBy.apply(filtered, this.ascending) : filtered;
      pagination?.setTotalItemCount(filtered.length);
      const rows = pagination
        ? sorted.slice(pagination.currentPageIndex * pagination.itemsPerPage, (pagination.currentPageIndex + 1) * pagination.itemsPerPage)
        : sorted;
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

  /* Filtering --------------------------------------------------------------- */

  /** The active filter of a column, if it has one. */
  filterOf(column: GridColumn<T>): GridFilterRule | undefined {
    return this.filters.get(column.owner);
  }

  /** Whether any column filters now. */
  get hasFilters(): boolean {
    return this.filters.size > 0;
  }

  /**
   * Sets or clears a column's filter (the built-in filter's Apply and Clear);
   * undefined clears. A new filter starts on the first page (like a new sort)
   * and the grid reloads: with an ItemsProvider, the request's
   * `getFilterByProperties` carries the filters.
   */
  async setFilterAsync(column: GridColumn<T>, rule: GridFilterRule | undefined): Promise<void> {
    const active = this.filters.get(column.owner);
    if (sameRule(active, rule)) return;
    this.filters.delete(column.owner);
    if (rule !== undefined) this.filters.set(column.owner, rule);
    this.filterVersion++;
    const pagination = this.source.pagination;
    if (pagination && pagination.currentPageIndex !== 0) await pagination.setCurrentPageIndexAsync(0);
    await this.refreshDataAsync();
  }

  /** The rows of `items` that match every active filter's column. */
  private filtered(items: readonly T[]): readonly T[] {
    if (this.filters.size === 0) return items;
    const rules: ([(item: T) => unknown, GridFilterRule] | undefined)[] = [...this.filters].map(([owner, rule]) => {
      const column = this.current.find((candidate) => candidate.owner === owner);
      const filterBy = column?.filterBy;
      return filterBy === undefined ? undefined : [filterBy, rule] as const;
    });
    const valueRules = rules.filter((entry) => entry !== undefined);
    if (valueRules.length === 0) return items;
    return items.filter((item) => valueRules.every(([filterBy, rule]) => gridFilterMatches(rule, filterBy(item))));
  }

  /* Aggregates -------------------------------------------------------------- */

  /**
   * The rows the footer aggregates over: the filtered and sorted source (an
   * ItemsProvider delivers windows, so its "all" is the current window), or
   * the current page's rows.
   */
  aggregateRows(scope: "all" | "page"): readonly T[] {
    if (scope === "page" || this.source.items === undefined) return this.rows;
    return this.sortedItems;
  }

  /** A column's footer value over the given scope (quickgrid-free: the skin renders it). */
  aggregateOf(column: GridColumn<T>, scope: "all" | "page" = "all"): unknown {
    const aggregate = column.aggregate;
    if (aggregate === undefined) return undefined;
    if (typeof aggregate === "function") return aggregate(this.aggregateRows(scope));
    return gridAggregate(aggregate, this.aggregateRows(scope).map((row) => column.aggregateBy?.(row)));
  }

  /* Inline editing ---------------------------------------------------------- */

  /** The row in the grid's inline edit, if any. */
  get editedRow(): T | undefined {
    return this.editedRowItem;
  }

  /** Whether `item` is the row in the grid's edit. */
  isEditing(item: T): boolean {
    return this.editedRowItem === item;
  }

  /** Puts `item` into the row's edit; one at a time, so another row's edit ends first. */
  editRow(item: T): void {
    if (this.editedRowItem === item) return;
    this.editedRowItem = item;
    this.onChange();
  }

  /** Ends the row's edit (the app's commit or cancel already happened; the skin reports the reason). */
  endEdit(): void {
    if (this.editedRowItem === undefined) return;
    this.editedRowItem = undefined;
    this.onChange();
  }

  /* Grouping ---------------------------------------------------------------- */

  /**
   * Sets the grouping (the grid's `group`); true when it changed and all groups opened again.
   * The grouping compares by the lambda's source, so a re-render's fresh inline lambda keeps the
   * group's collapse state.
   */
  setGroup(groupBy: ((item: T) => unknown) | undefined): boolean {
    const source = groupBy === undefined ? undefined : Function.prototype.toString.call(groupBy);
    if (source === this.groupSource) return false;
    this.groupBy = groupBy;
    this.groupSource = source;
    this.groupCollapsed.clear();
    this.groupVersion++;
    return true;
  }

  /** Whether the grid groups (a source is set). */
  get group(): ((item: T) => unknown) | undefined {
    return this.groupBy;
  }

  /** Opens (or closes) a group's rows (the group header's toggle; the value as the model ordered it). */
  toggleGroup(value: unknown): void {
    const key = String(value);
    if (!this.groupCollapsed.delete(key)) this.groupCollapsed.add(key);
    this.groupVersion++;
    this.onChange();
  }

  /**
   * The view's lines: the rows, or a group's header line (its open rows follow). Without a
   * grouping they are the rows, one level each. Groups order by their value, rows within a group
   * keep the sort's order; the paged view groups its own page's rows.
   */
  get lines(): readonly GridRow<T>[] {
    const rows = this.rows;
    if (this.groupBy === undefined) return rows.map((item): GridRow<T> => ({ kind: "row", item }));
    // The cache (rows, the sort's owner and direction, the page, the filters, the group's source and state):
    const sortOwner = this.sortOwner;
    const pagination = this.source.pagination;
    const key = [rows, rows.length, sortOwner, this.ascending, pagination?.currentPageIndex, pagination?.itemsPerPage, this.filterVersion, this.groupSource, this.groupVersion];
    if (this.lined === undefined || key.some((part, index) => !Object.is(part, this.lined!.key[index]))) {
      const groups = new Map<string, { value: unknown; rows: T[] }>();
      for (const row of rows) {
        const value = this.groupBy!(row);
        const groupKey = String(value);
        const group = groups.get(groupKey);
        if (group === undefined) groups.set(groupKey, { value, rows: [row] });
        else group.rows.push(row);
      }
      const values = [...groups.values()];
      values.sort((a, b) => compareValues(a.value, b.value));
      const lines: GridRow<T>[] = [];
      const indexes = new Map<unknown, number>();
      for (const group of values) {
        lines.push({ kind: "group", value: group.value, count: group.rows.length, open: !this.groupCollapsed.has(String(group.value)), depth: 0 });
        if (this.groupCollapsed.has(String(group.value))) continue;
        for (const row of group.rows) {
          indexes.set(row, lines.push({ kind: "row", item: row }) - 1);
        }
      }
      this.lined = { key, lines, indexes };
    }
    return this.lined.lines;
  }

  /** The index of a current row within the lines (0-based among the data rows; -1 when it isn't one). */
  rowIndexOf(item: T): number {
    if (this.groupBy === undefined) return this.rows.indexOf(item);
    this.lines; // the lines' index map builds (or caches) with the view
    const index = this.lined?.indexes.get(item);
    return index === undefined ? -1 : index;
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

  /** All rows of `Items`, filtered and sorted (a virtualized grid renders a window of them). */
  get sortedItems(): readonly T[] {
    const items = this.source.items ?? [];
    const column = this.sortColumn;
    const key = [items, items.length, column?.owner, this.ascending, this.filterVersion];
    if (this.sortedView === undefined || key.some((part, index) => !Object.is(part, this.sortedView!.key[index]))) {
      const filtered = this.filtered(items);
      this.sortedView = { key, rows: column?.sortBy ? column.sortBy.apply(filtered, this.ascending) : filtered };
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
      getFilterByProperties: () => this.filterProperties(),
    };
  }

  /** The active filters with their columns' `filterKey`, for a server query. */
  private filterProperties(): FilteredProperty[] {
    const result: FilteredProperty[] = [];
    for (const [owner, rule] of this.filters) {
      const column = this.current.find((candidate) => candidate.owner === owner);
      if (column?.filterKey !== undefined) {
        result.push({ propertyName: column.filterKey, operator: rule.operator, ...(rule.value === undefined ? {} : { value: rule.value }) });
      }
    }
    return result;
  }

  /** Stops following the pagination state and aborts a running request. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.abort?.abort();
  }
}

/** Whether `rule` is the filter `active` already holds (an exact rule object equals its stored copy). */
function sameRule(active: GridFilterRule | undefined, rule: GridFilterRule | undefined): boolean {
  if (active === rule) return true;
  return active !== undefined && rule !== undefined && active.operator === rule.operator && active.value === rule.value;
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

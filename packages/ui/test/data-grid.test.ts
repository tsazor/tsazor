import { describe, expect, it, vi } from "vitest";
import { DataGridModel, GridSort, PaginationState, type GridColumn, type GridFilterRule, type GridItemsProviderRequest } from "../src/index";
import { compareValues, gridFilterMatches, propertyPath, propertyTitle, toggleAll, toggleSelection } from "../src/kit";

interface Order {
  id: number;
  customer: string;
  total: number;
}

const orders: Order[] = [
  { id: 1, customer: "Marta", total: 12 },
  { id: 2, customer: "jonas", total: 30 },
  { id: 3, customer: "Lena", total: 12 },
  { id: 4, customer: "Ali", total: 7 },
];

const fragment = () => () => undefined;
function column(owner: object, extra: Partial<GridColumn<Order>> = {}): GridColumn<Order> {
  return { owner, title: "t", cell: fragment, sortable: true, ...extra };
}

/** One render: the grid collects its columns. */
function render(model: DataGridModel<Order>, columns: GridColumn<Order>[]): boolean {
  model.startCollectingColumns();
  for (const c of columns) model.addColumn(c);
  return model.finishCollectingColumns();
}

describe("GridSort", () => {
  it("sorts stably by steps, and flips every step for descending", () => {
    const sort = GridSort.byAscending((o: Order) => o.total).thenAscending((o) => o.customer);
    expect(sort.apply(orders).map((o) => o.id)).toEqual([4, 3, 1, 2]);
    expect(sort.apply(orders, false).map((o) => o.id)).toEqual([2, 1, 3, 4]);
    expect(GridSort.byDescending((o: Order) => o.total).apply(orders).map((o) => o.id)).toEqual([2, 1, 3, 4]);
  });

  it("compares text by collation (case, numbers) and puts missing values last", () => {
    expect(["b", "A", "a10", "a9"].sort(compareValues)).toEqual(["A", "a9", "a10", "b"]);
    expect(GridSort.byAscending((v: number | null | undefined) => v).apply([3, undefined, 1, null])).toEqual([1, 3, undefined, null]);
    expect(compareValues(new Date(1), new Date(2))).toBeLessThan(0);
  });
});

describe("PaginationState", () => {
  it("clamps the page to the known total and reports changes", async () => {
    const state = new PaginationState();
    state.itemsPerPage = 2;
    const changes: unknown[] = [];
    state.subscribe((change) => changes.push(change));
    state.setTotalItemCount(5);
    expect(state.lastPageIndex).toBe(2);
    await state.setCurrentPageIndexAsync(9);
    expect(state.currentPageIndex).toBe(2);
    state.setTotalItemCount(3);
    expect(state.currentPageIndex).toBe(1);
    expect(changes).toEqual(["total", "page", "total", "page"]);
  });
});

describe("DataGridModel", () => {
  it("collects the columns in markup order on every render", () => {
    const model = new DataGridModel<Order>(() => undefined);
    const a = column({}), b = column({});
    render(model, [a, b]);
    expect(model.columns).toEqual([a, b]);
    render(model, [b]);
    expect(model.columns).toEqual([b]);
  });

  it("applies the default sort once, then toggles on sort", async () => {
    const onChange = vi.fn();
    const model = new DataGridModel<Order>(onChange);
    model.setSource({ items: orders });
    const owner = {};
    const total = column(owner, { sortBy: GridSort.byAscending((o) => o.total), isDefaultSortColumn: true, initialSortDirection: "descending" });
    expect(render(model, [total])).toBe(true);
    expect(model.rows.map((o) => o.id)).toEqual([2, 1, 3, 4]);
    expect(model.sortDirectionOf(total)).toBe("descending");
    expect(render(model, [column(owner, total)])).toBe(false);
    await model.sortByColumnAsync(model.columns[0]!);
    expect(model.rows.map((o) => o.id)).toEqual([4, 1, 3, 2]);
    expect(onChange).toHaveBeenCalled();
  });

  it("pages Items and reports the total to the pagination state", async () => {
    const model = new DataGridModel<Order>(() => undefined);
    const pagination = new PaginationState();
    pagination.itemsPerPage = 3;
    model.setSource({ items: orders, pagination });
    render(model, []);
    expect(model.rows.map((o) => o.id)).toEqual([1, 2, 3]);
    expect(pagination.totalItemCount).toBe(4);
    await pagination.setCurrentPageIndexAsync(1);
    expect(model.rows.map((o) => o.id)).toEqual([4]);
  });

  it("asks the ItemsProvider for the page and sort, aborting a superseded request", async () => {
    const requests: GridItemsProviderRequest<Order>[] = [];
    const provider = async (request: GridItemsProviderRequest<Order>) => {
      requests.push(request);
      await Promise.resolve();
      const page = request.applySorting(orders).slice(request.startIndex, request.startIndex + (request.count ?? orders.length));
      return { items: page, totalItemCount: orders.length };
    };
    const model = new DataGridModel<Order>(() => undefined);
    const pagination = new PaginationState();
    pagination.itemsPerPage = 2;
    model.setSource({ itemsProvider: provider, pagination });
    const customer = column({}, { sortBy: GridSort.byAscending((o) => o.customer), sortKey: "customer" });
    render(model, [customer]);
    const first = model.refreshDataAsync();
    expect(model.loading).toBe(true);
    await model.sortByColumnAsync(model.columns[0]!);
    await first;
    expect(requests[0]!.signal.aborted).toBe(true);
    expect(model.loading).toBe(false);
    expect(model.rows.map((o) => o.customer)).toEqual(["Ali", "jonas"]);
    expect(requests.at(-1)!.getSortByProperties()).toEqual([{ propertyName: "customer", direction: "ascending" }]);
    await pagination.setCurrentPageIndexAsync(1);
    await vi.waitFor(() => expect(model.rows.map((o) => o.customer)).toEqual(["Lena", "Marta"]));
    expect(requests.at(-1)!.startIndex).toBe(2);
  });

  it("rejects Items together with an ItemsProvider", () => {
    const model = new DataGridModel<Order>(() => undefined);
    expect(() => model.setSource({ items: orders, itemsProvider: () => ({ items: [], totalItemCount: 0 }) })).toThrow(/either Items or ItemsProvider/);
  });
});

describe("gridFilterMatches", () => {
  const rule = (operator: GridFilterRule["operator"], value?: GridFilterRule["value"]): GridFilterRule => ({ operator, value });
  it("matches text case-insensitively and numbers by value", () => {
    expect(gridFilterMatches(rule("contains", "art"), "Marta")).toBe(true);
    expect(gridFilterMatches(rule("contains", "xyz"), "Marta")).toBe(false);
    expect(gridFilterMatches(rule("equals", "marta"), "Marta")).toBe(true);
    expect(gridFilterMatches(rule("notEquals", "marta"), "Marta")).toBe(false);
    expect(gridFilterMatches(rule("startsWith", "ma"), "Marta")).toBe(true);
    expect(gridFilterMatches(rule("endsWith", "ta"), "Marta")).toBe(true);
    expect(gridFilterMatches(rule("notContains", "xyz"), "Marta")).toBe(true);
  });

  it("orders and emptiness: missing values never match a value rule", () => {
    expect(gridFilterMatches(rule("greaterThan", 10), 12)).toBe(true);
    expect(gridFilterMatches(rule("greaterThanOrEqual", 12), 12)).toBe(true);
    expect(gridFilterMatches(rule("lessThan", 10), 7)).toBe(true);
    expect(gridFilterMatches(rule("lessThanOrEqual", 7), 8)).toBe(false);
    expect(gridFilterMatches(rule("lessThan", 10.5), "30")).toBe(false);
    expect(gridFilterMatches(rule("greaterThan", 10), null)).toBe(false);
    expect(gridFilterMatches(rule("empty"), null)).toBe(true);
    expect(gridFilterMatches(rule("empty"), "")).toBe(true);
    expect(gridFilterMatches(rule("notEmpty"), "")).toBe(false);
    expect(gridFilterMatches(rule("notEmpty"), 0)).toBe(true);
  });
});

describe("column filters", () => {
  const filterColumn = (owner: object, filterBy: (o: Order) => unknown, extra: Partial<GridColumn<Order>> = {}): GridColumn<Order> =>
    column(owner, { filterable: true, filterBy, filterKey: "customer", ...extra });

  it("filters Items on every active filter, and the pagination total follows", async () => {
    const model = new DataGridModel<Order>(() => undefined);
    const pagination = new PaginationState();
    pagination.itemsPerPage = 2;
    const customer = filterColumn({}, (o) => o.customer);
    const total = filterColumn({}, (o) => o.total);
    model.setSource({ items: orders, pagination });
    render(model, [customer, total]);
    await model.setFilterAsync(total, { operator: "greaterThan", value: 10 });
    expect(model.rows.map((o) => o.id)).toEqual([1, 2]);
    expect(pagination.totalItemCount).toBe(3);
    await model.setFilterAsync(customer, { operator: "contains", value: "en" });
    expect(model.rows.map((o) => o.id)).toEqual([3]);
  });

  it("clears a filter, and a same-rule set is a no-op", async () => {
    const onChange = vi.fn();
    const model = new DataGridModel<Order>(onChange);
    model.setSource({ items: orders });
    const customer = filterColumn({}, (o) => o.customer);
    render(model, [customer]);
    const rule: GridFilterRule = { operator: "equals", value: "Marta" };
    await model.setFilterAsync(customer, rule);
    expect(model.hasFilters).toBe(true);
    await model.setFilterAsync(customer, { operator: "equals", value: "Marta" });
    expect(model.rows.map((o) => o.id)).toEqual([1]);
    await model.setFilterAsync(customer, undefined);
    expect(model.hasFilters).toBe(false);
    expect(model.rows.map((o) => o.id)).toEqual([1, 2, 3, 4]);
  });

  it("keeps a virtualized grid's sortedItems filtered too", async () => {
    const model = new DataGridModel<Order>(() => undefined);
    model.setSource({ items: orders });
    const total = filterColumn({}, (o) => o.total);
    render(model, [total]);
    await model.setFilterAsync(total, { operator: "lessThan", value: 15 });
    expect(model.sortedItems.map((o) => o.id)).toEqual([1, 3, 4]);
  });

  it("hands the active filters to the request as property names", async () => {
    const requests: GridItemsProviderRequest<Order>[] = [];
    const provider = (request: GridItemsProviderRequest<Order>) => {
      requests.push(request);
      const matches = (property: { propertyName: string; operator: string; value?: unknown }, order: Order): boolean =>
        property.propertyName === "customer" ? order.customer.toLowerCase().includes(String(property.value)) : true;
      const rows = orders.filter((order) => request.getFilterByProperties().every((property) => matches(property, order)));
      return { items: rows, totalItemCount: rows.length };
    };
    const model = new DataGridModel<Order>(() => undefined);
    model.setSource({ itemsProvider: provider });
    const customer = filterColumn({}, (o) => o.customer);
    render(model, [customer]);
    await model.setFilterAsync(customer, { operator: "startsWith", value: "l" });
    expect(model.rows.map((o) => o.id)).toEqual([3, 4]); // the provider matches "l" anywhere; "Ali" has one
    expect(requests.at(-1)!.getFilterByProperties()).toEqual([{ propertyName: "customer", operator: "startsWith", value: "l" }]);
  });
});

describe("selection and titles", () => {
  it("single replaces, multiple toggles, select-all adds or removes the page", () => {
    const [a, b, c] = orders;
    expect(toggleSelection([a], b, "single")).toEqual([b]);
    expect(toggleSelection([a], a, "single")).toEqual([]);
    expect(toggleSelection([a], b, "multiple")).toEqual([a, b]);
    expect(toggleSelection([a, b], a, "multiple")).toEqual([b]);
    expect(toggleAll([c], [a, b])).toEqual([c, a, b]);
    expect(toggleAll([a, b, c], [a, b])).toEqual([c]);
  });

  it("takes a column title from a property lambda", () => {
    expect(propertyTitle((o: Order) => o.customer)).toBe("customer");
    expect(propertyPath((o: { customer: { name: string } }) => o.customer.name)).toBe("customer.name");
    expect(propertyPath((o: { a?: { b: number } }) => o.a?.b)).toBe("a.b");
    expect(propertyTitle((o: Order) => o.total * 2)).toBeUndefined();
  });
});

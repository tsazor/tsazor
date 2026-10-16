import { describe, expect, it, vi } from "vitest";
import { DataGridModel, GridSort, PaginationState, gridAggregate, type GridColumn, type GridFilterRule, type GridItemsProviderRequest } from "../src/index";
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

describe("gridAggregate", () => {
  it("counts, sums and averages the numeric values", () => {
    expect(gridAggregate("count", [1, "a", undefined, 2])).toBe(4);
    expect(gridAggregate("sum", [1, 2.5, undefined, "x"])).toBe(3.5);
    expect(gridAggregate("avg", [2, 4, "x"])).toBe(3);
    expect(gridAggregate("sum", [])).toBe(0);
    expect(gridAggregate("avg", [])).toBeUndefined();
  });

  it("picks min and max by value order, ignoring nothing but null", () => {
    expect(gridAggregate("min", [12, 7, 30])).toBe(7);
    expect(gridAggregate("max", [{ total: 12 }, { total: 30 }])).toBeUndefined(); // objects have no order
    expect(gridAggregate("max", [new Date(2), new Date(5)])).toEqual(new Date(5));
    expect(gridAggregate("min", [null, undefined])).toBeUndefined();
    expect(gridAggregate("max", ["b", "A", "a10"])).toBe("b");
  });
});

describe("column aggregates", () => {
  const aggregateColumn = (owner: object, kind: GridColumn<Order>["aggregate"], extra: Partial<GridColumn<Order>> = {}): GridColumn<Order> =>
    column(owner, { aggregate: kind, aggregateBy: (o) => o.total, ...extra });

  it("computes a column's footer over all rows, and the page's rows on demand", async () => {
    const model = new DataGridModel<Order>(() => undefined);
    const pagination = new PaginationState();
    pagination.itemsPerPage = 2;
    const total = aggregateColumn({}, "sum");
    model.setSource({ items: orders, pagination });
    render(model, [total]);
    void model.rows;
    expect(model.aggregateOf(total, "all")).toBe(12 + 30 + 12 + 7);
    expect(model.aggregateOf(total, "page")).toBe(42); // the first page's rows
    await pagination.setCurrentPageIndexAsync(1);
    expect(model.aggregateOf(total, "page")).toBe(19);
  });

  it("formats and passes a custom aggregate through", () => {
    const model = new DataGridModel<Order>(() => undefined);
    const custom = aggregateColumn({}, (rows) => rows.length);
    model.setSource({ items: orders });
    render(model, [custom]);
    expect(model.aggregateOf(custom)).toBe(4);
  });

  it("is undefined for a column without one", () => {
    const model = new DataGridModel<Order>(() => undefined);
    const plain = column({});
    model.setSource({ items: orders.slice(0, 1) });
    render(model, [plain]);
    expect(model.aggregateOf(plain)).toBeUndefined();
  });
});

describe("column order and widths", () => {
  it("keeps a reorder across renders, and joins fresh columns at the tail", () => {
    const onChange = vi.fn();
    const model = new DataGridModel<Order>(onChange);
    const a = column({}), b = column({}), c = column({});
    render(model, [a, b, c]);
    expect(model.orderedColumns.map((entry) => entry.owner)).toEqual([a.owner, b.owner, c.owner]);
    model.moveColumnAsync(a, 2);
    expect(model.orderedColumns.map((entry) => entry.owner)).toEqual([b.owner, c.owner, a.owner]);
    expect(model.indexOfColumn(c)).toBe(1);
    expect(onChange).toHaveBeenCalled();
    expect(model.moveColumnAsync(a, 2)).toBeUndefined(); // already there: no event
    const before = onChange.mock.calls.length;
    const dropped = render(model, [a, b]); // c goes away, d's nothing new
    expect(dropped).toBe(false);
    expect(model.orderedColumns.map((entry) => entry.owner)).toEqual([b.owner, a.owner]);
  });

  it("sets and clears a column's width; an equal set is a no-op", async () => {
    const onChange = vi.fn();
    const model = new DataGridModel<Order>(onChange);
    const a = column({});
    model.setSource({ items: orders });
    render(model, [a]);
    expect(model.widthOf(a)).toBeUndefined();
    await model.setColumnWidthAsync(a, "120px");
    expect(model.widthOf(a)).toBe("120px");
    expect(onChange).toHaveBeenCalledTimes(1);
    await model.setColumnWidthAsync(a, "120px");
    expect(onChange).toHaveBeenCalledTimes(1);
    await model.setColumnWidthAsync(a, undefined);
    expect(model.widthOf(a)).toBeUndefined();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("inline editing", () => {
  it("edits one row at a time and ends it", () => {
    const onChange = vi.fn();
    const model = new DataGridModel<Order>(onChange);
    expect(model.editedRow).toBeUndefined();
    model.editRow(orders[0]!);
    expect(model.isEditing(orders[0]!)).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    model.editRow(orders[1]!); // the first edit ends with the second
    expect(model.isEditing(orders[0]!)).toBe(false);
    expect(model.editedRow).toBe(orders[1]);
    expect(onChange).toHaveBeenCalledTimes(2);
    model.endEdit();
    expect(model.editedRow).toBeUndefined();
    model.endEdit(); // no edit: nothing changes
    expect(onChange).toHaveBeenCalledTimes(3);
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

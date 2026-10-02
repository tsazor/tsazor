export interface Order {
    id: number;
    customer: string;
    total: number;
    open: boolean;
}

export const orders: Order[] = [
    { id: 1, customer: "Ada", total: 120, open: true },
    { id: 2, customer: "Grace", total: 35, open: false },
    { id: 3, customer: "Linus", total: 80, open: true },
    { id: 4, customer: "Barbara", total: 210, open: true },
    { id: 5, customer: "Ken", total: 15, open: true },
];

// orders.Where(o => o.Open).Sum(o => o.Total)
export const openTotal = orders.filter((o) => o.open).reduce((sum, o) => sum + o.total, 0);

// orders.Any(o => o.Total > 200)
export const hasBigOrder = orders.some((o) => o.total > 200);

// orders.FirstOrDefault(o => !o.Open)?.Customer
export const firstClosed = orders.find((o) => !o.open)?.customer;

// orders.Where(o => o.Open).OrderByDescending(o => o.Total).Take(3).Select(o => o.Customer)
export function topOpenCustomers(): string[] {
    return [];
}

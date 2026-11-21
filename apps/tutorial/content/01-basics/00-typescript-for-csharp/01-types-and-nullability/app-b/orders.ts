export interface Order {
    id: number;
    customer: string;
    /** Missing means "one item". */
    quantity?: number;
    note: string | null;
    shipping?: { city: string };
}

export const orders: Order[] = [
    { id: 1, customer: "Ada", quantity: 3, note: "Ring twice", shipping: { city: "London" } },
    { id: 2, customer: "Grace", quantity: 0, note: null, shipping: { city: "Arlington" } },
    { id: 3, customer: "Linus", note: null },
];

export function quantityOf(order: Order): number {
    return order.quantity ?? 1;
}

export function cityOf(order: Order): string {
    return order.shipping?.city ?? "(pickup)";
}

export function noteOf(order: Order): string {
    return order.note ?? "—";
}

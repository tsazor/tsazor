// C#: public enum OrderStatus { Open, Shipped, Delivered }

// C#: public record Order(int Id, string Customer, OrderStatus Status);
export interface Order {
    readonly id: number;
    readonly customer: string;
    readonly status: string;
}

export const orders: readonly Order[] = [
    { id: 1, customer: "Ada", status: "open" },
    { id: 2, customer: "Grace", status: "shipped" },
    { id: 3, customer: "Linus", status: "delivered" },
];

export function label(status: string): string {
    switch (status) {
        case "open":
            return "📝 Open";
        case "shiped":
            return "🚚 On its way";
        case "delivered":
            return "📦 Delivered";
        default:
            return "❓ Unknown";
    }
}

// C#: var shipped = order with { Status = OrderStatus.Shipped };
export function ship(order: Order): Order {
    return { ...order, status: "shipped" };
}

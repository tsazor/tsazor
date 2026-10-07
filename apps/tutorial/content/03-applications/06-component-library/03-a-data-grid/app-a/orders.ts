export interface Order {
    id: number;
    customer: string;
    loaves: number;
    total: number;
}

const customers = ["Marta", "Jonas", "Lena", "Ali", "Noor", "Pavel"];

/** Today's orders. */
export const todaysOrders: Order[] = Array.from({ length: 12 }, (_, i) => ({
    id: 101 + i,
    customer: customers[(i * 5) % customers.length]!,
    loaves: (i % 4) + 1,
    total: ((i % 4) + 1) * 3.4,
}));

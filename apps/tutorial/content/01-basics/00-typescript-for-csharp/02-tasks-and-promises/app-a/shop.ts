export interface User {
    name: string;
}

export interface Order {
    id: number;
    total: number;
}

export interface Dashboard {
    user: User;
    orders?: Order[];
}

/** Stands in for an HTTP call to the backend. */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadUser(): Promise<User> {
    await delay(20);
    return { name: "Ada" };
}

export async function loadOrders(): Promise<Order[]> {
    await delay(20);
    return [
        { id: 1, total: 42 },
        { id: 2, total: 17.5 },
    ];
}

export async function loadDashboard(): Promise<Dashboard> {
    const user = await loadUser();
    return { user };
}

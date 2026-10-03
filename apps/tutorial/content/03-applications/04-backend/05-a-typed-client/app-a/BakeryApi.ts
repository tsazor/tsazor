import type { Order } from "./Order";

/*
 * The bakery's server, played in memory: the preview has no real one.
 * TsazorHttp hands every request to bakeryApi instead of sending it over
 * the network — your components can't tell the difference.
 */

const orders: Order[] = [
    { id: 101, customer: "Marta", bread: "sourdough", quantity: 1, state: "open" },
    { id: 102, customer: "Jonas", bread: "rye", quantity: 2, state: "picked-up" },
    { id: 103, customer: "Bea", bread: "ciabatta", quantity: 1, state: "open" },
    { id: 104, customer: "Omar", bread: "sourdough", quantity: 3, state: "open" },
    { id: 105, customer: "Lena", bread: "rye", quantity: 1, state: "picked-up" },
];

/** Loaves left today, per bread. */
const stock: Record<string, number> = { sourdough: 12, rye: 0, ciabatta: 2 };

export async function bakeryApi(request: Request): Promise<Response> {
    await new Promise((resolve) => setTimeout(resolve, 300)); // the network
    const url = new URL(request.url);

    if (url.pathname === "/api/orders" && request.method === "GET") {
        const state = url.searchParams.get("state");
        return json(200, state === null ? orders : orders.filter((order) => order.state === state));
    }

    if (url.pathname === "/api/orders" && request.method === "POST") {
        const { name, bread, quantity } = (await request.json()) as { name: string; bread: string; quantity: number };
        const left = stock[bread] ?? 0;
        if (quantity > left) {
            return json(409, {
                type: "https://bakery.example/problems/sold-out",
                title: "Not enough bread",
                status: 409,
                detail: `Only ${left} ${bread} left today.`,
            });
        }
        stock[bread] = left - quantity;
        const order: Order = { id: 101 + orders.length, customer: name, bread, quantity, state: "open" };
        orders.push(order);
        return json(201, order);
    }

    return json(404, { title: "Not found", status: 404 });
}

function json(status: number, body: unknown): Response {
    const type = status >= 400 ? "application/problem+json" : "application/json";
    return new Response(JSON.stringify(body), { status, headers: { "content-type": type } });
}

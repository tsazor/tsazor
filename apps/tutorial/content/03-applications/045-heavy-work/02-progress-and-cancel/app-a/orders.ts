export interface ImportResult {
    orders: number;
    loaves: number;
}

/** A day's order list as text, one order per line: "id;customer;loaves". */
export function sampleOrders(count: number): string {
    const lines: string[] = [];
    for (let i = 1; i <= count; i++) lines.push(`${i};customer ${i % 97};${(i % 5) + 1}`);
    return lines.join("\n");
}

/** Reads the order list and adds it up — real work for a big list. */
export function parseOrders(text: string): ImportResult {
    let orders = 0;
    let loaves = 0;
    for (const line of text.split("\n")) {
        const [id, customer, count] = line.split(";");
        if (!id || !customer) continue;
        orders++;
        loaves += Number(count);
    }
    return { orders, loaves };
}

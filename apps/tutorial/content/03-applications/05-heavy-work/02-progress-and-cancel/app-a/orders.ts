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

/** Reads the order list, checks every order and adds it up — real work for a big list. */
export function parseOrders(text: string): ImportResult {
    let orders = 0;
    let loaves = 0;
    for (const line of text.split("\n")) {
        const [id, customer, count] = line.split(";");
        if (!id || !customer) continue;
        orders++;
        loaves += Number(count);
        if (orders % 1000 === 0) checkOrders();
    }
    return { orders, loaves };
}

/**
 * Checks the last 1,000 orders against the bakery's rules (stock, delivery
 * area, prices). Here it is a stand-in: it keeps the thread busy for 7.5 ms,
 * about 3 seconds for the whole day, on any machine. It blocks like real work
 * does; a `setTimeout` would not.
 */
function checkOrders(): void {
    const until = performance.now() + 7.5;
    while (performance.now() < until) {
        // The real checks would run here.
    }
}

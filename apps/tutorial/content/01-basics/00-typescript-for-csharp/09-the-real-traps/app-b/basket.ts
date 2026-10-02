export class Basket {
    /** Cents: integers are exact. */
    total = 0;

    addAll(prices: number[]): void {
        prices.forEach((price) => {
            this.total += Math.round(price * 100);
        });
    }
}

/** What the basket shows, or the error it threw. */
export function checkout(prices: number[]): string {
    try {
        const basket = new Basket();
        basket.addAll(prices);
        return `Total: ${(basket.total / 100).toFixed(2)}`;
    } catch (error) {
        return `${(error as Error).name}: ${(error as Error).message}`;
    }
}

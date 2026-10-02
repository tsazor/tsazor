export class Basket {
    /** Euros. */
    total = 0;

    addAll(prices: number[]): void {
        prices.forEach(function (price) {
            this.total += price;
        });
    }
}

/** What the basket shows, or the error it threw. */
export function checkout(prices: number[]): string {
    try {
        const basket = new Basket();
        basket.addAll(prices);
        return `Total: ${basket.total}`;
    } catch (error) {
        return `${(error as Error).name}: ${(error as Error).message}`;
    }
}
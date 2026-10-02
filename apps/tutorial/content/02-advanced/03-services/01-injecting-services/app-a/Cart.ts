/** The shopping cart: plain TypeScript, no framework in sight. */
export class Cart {
    readonly items: string[] = [];
    readonly #listeners = new Set<() => void>();

    get count(): number {
        return this.items.length;
    }

    add(item: string): void {
        this.items.push(item);
        for (const notify of this.#listeners) notify();
    }

    /** Calls `listener` after every change; the returned function stops it. */
    subscribe(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
}

/** Counts points and tells its listeners. */
export class Tally {
    points = 0;
    readonly #listeners = new Set<() => void>();

    add(): void {
        this.points++;
        for (const notify of this.#listeners) notify();
    }

    subscribe(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
}

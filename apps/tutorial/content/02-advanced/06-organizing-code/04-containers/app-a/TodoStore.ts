export interface Todo {
    id: number;
    title: string;
    done: boolean;
}

/** The app's todos — shared state, so it's a service. */
export class TodoStore {
    readonly todos: Todo[] = [
        { id: 1, title: "Water the plants", done: true },
        { id: 2, title: "Call the bakery", done: false },
        { id: 3, title: "Fix the bike", done: false },
    ];
    readonly #listeners = new Set<() => void>();

    toggle(id: number): void {
        const todo = this.todos.find((candidate) => candidate.id === id);
        if (todo) todo.done = !todo.done;
        for (const notify of this.#listeners) notify();
    }

    subscribe(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
}

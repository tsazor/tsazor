/**
 * A tiny live data source, standing in for a server push, a WebSocket or a
 * store shared by several components: the price moves twice a second, and
 * anyone can listen.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | undefined;

export const ticker = {
    price: 100,

    /** How many listeners there are right now. */
    get listeners(): number {
        return listeners.size;
    },

    /** Calls `listener` after every change; the returned function stops it. */
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        timer ??= setInterval(() => {
            ticker.price += 0.25;
            for (const notify of listeners) notify();
        }, 500);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) {
                clearInterval(timer);
                timer = undefined;
            }
        };
    },
};

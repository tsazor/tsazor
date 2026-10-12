/**
 * Blazored.LocalStorage's ILocalStorageService, as much of it as BlazorHero uses: JSON values in localStorage. The
 * original keeps its JWT here so a reload stays signed in; the owner kept that for the port (docs/auth.md advises
 * memory only — port-blazorhero.md). Blocked storage (a private window) reads as empty and writes nothing.
 */
export class LocalStorage {
    getItem<T>(key: string): T | undefined {
        try {
            const text = globalThis.localStorage.getItem(key);
            return text === null ? undefined : (JSON.parse(text) as T);
        } catch {
            return undefined;
        }
    }

    setItem(key: string, value: unknown): void {
        try {
            globalThis.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* blocked storage: the value lives for this page only */
        }
    }

    removeItem(key: string): void {
        try {
            globalThis.localStorage.removeItem(key);
        } catch {
            /* blocked storage */
        }
    }
}

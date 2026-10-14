/**
 * The model of an autocomplete (Fluent UI Blazor's FluentAutocomplete, the ARIA combobox pattern with a
 * listbox popup), shared by the skins: the search (async, the newest wins, the older ones aborted), the
 * keyboard, and the selection. Pure, so both skins render the same behavior.
 */

/**
 * Runs searches one at a time from the user's point of view: a new one aborts the one before (its
 * `AbortSignal` fires) and an older answer that still arrives is dropped. `run` resolves with the
 * options, or with undefined when a newer search overtook it.
 */
export class SearchRunner<TOption> {
    private current?: AbortController;

    constructor(private readonly search: (text: string, signal: AbortSignal) => Promise<readonly TOption[]> | readonly TOption[]) {}

    async runAsync(text: string): Promise<readonly TOption[] | undefined> {
        this.current?.abort();
        const controller = new AbortController();
        this.current = controller;
        try {
            const options = await this.search(text, controller.signal);
            return controller.signal.aborted ? undefined : options;
        } catch (error) {
            // An aborted search may reject (fetch does); that's not an error, a newer search took over.
            if (controller.signal.aborted) return undefined;
            throw error;
        } finally {
            if (this.current === controller) this.current = undefined;
        }
    }

    /** Aborts the search in flight (the component goes away). */
    cancel(): void {
        this.current?.abort();
        this.current = undefined;
    }
}

/** The options whose text contains the search text, ignoring case (an empty text matches all). */
export function filterOptions<TOption>(options: readonly TOption[], text: string, optionText: (option: TOption) => string): TOption[] {
    const needle = text.trim().toLowerCase();
    return needle === "" ? [...options] : options.filter((option) => optionText(option).toLowerCase().includes(needle));
}

/** What a key does in an autocomplete's input. */
export type ComboboxKeyAction =
    | { kind: "open"; active: number }
    | { kind: "move"; active: number }
    | { kind: "select"; index: number }
    | { kind: "close" }
    | { kind: "remove-last" }
    | { kind: "none" };

/**
 * A key in the input of the ARIA combobox pattern: ArrowDown/ArrowUp open the list or move the active option
 * (wrapping), Home/End jump while it's open, Enter selects the active option, Escape closes, and Backspace in
 * an empty input removes the last selected option (several values).
 */
export function comboboxKeyAction(
    key: string,
    state: { open: boolean; active: number; count: number; inputEmpty: boolean; multiple: boolean },
): ComboboxKeyAction {
    const { open, active, count, inputEmpty, multiple } = state;
    switch (key) {
        case "ArrowDown":
            if (count === 0) return { kind: "none" };
            if (!open) return { kind: "open", active: 0 };
            return { kind: "move", active: active < 0 ? 0 : (active + 1) % count };
        case "ArrowUp":
            if (count === 0) return { kind: "none" };
            if (!open) return { kind: "open", active: count - 1 };
            return { kind: "move", active: active <= 0 ? count - 1 : active - 1 };
        case "Home":
            return open && count > 0 ? { kind: "move", active: 0 } : { kind: "none" };
        case "End":
            return open && count > 0 ? { kind: "move", active: count - 1 } : { kind: "none" };
        case "Enter":
            return open && active >= 0 && active < count ? { kind: "select", index: active } : { kind: "none" };
        case "Escape":
            return open ? { kind: "close" } : { kind: "none" };
        case "Backspace":
            return multiple && inputEmpty ? { kind: "remove-last" } : { kind: "none" };
        default:
            return { kind: "none" };
    }
}

/**
 * The selection after picking `option`: with several values it's added (or removed when it's in already),
 * up to `maximum`; with one it replaces the selection. Options are the same when their keys are.
 */
export function toggleOption<TOption>(
    selected: readonly TOption[],
    option: TOption,
    options: { multiple: boolean; maximum?: number; key: (option: TOption) => unknown },
): TOption[] {
    const key = options.key(option);
    const index = selected.findIndex((candidate) => options.key(candidate) === key);
    if (!options.multiple) return [option];
    if (index >= 0) return selected.filter((_, i) => i !== index);
    if (options.maximum !== undefined && selected.length >= options.maximum) return [...selected];
    return [...selected, option];
}

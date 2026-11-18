/** Types for the pure jobs helpers (plain .mjs, unit-tested via node --test). */
declare function fieldErrorsOf(
    error: { code: number; details?: string | null } | null | undefined,
): Record<string, string[]> | null;
declare function appendSequenced<T extends { seq: number }>(events: readonly T[], event: T): T[];
declare function jobVariant(state: string | null | undefined): "success" | "danger" | "primary";
export { fieldErrorsOf, appendSequenced, jobVariant };

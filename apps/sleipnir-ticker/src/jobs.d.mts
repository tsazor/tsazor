/** Types for the pure jobs helpers (plain .mjs, unit-tested via node --test). */
declare function fieldErrorsOf(
    error: { code: number; details?: string | null } | null | undefined,
): Record<string, string[]> | null;
declare function jobVariant(state: string | null | undefined): "success" | "danger" | "primary";
export { fieldErrorsOf, jobVariant };

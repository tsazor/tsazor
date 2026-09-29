/** Types for the pure formatting helpers (plain .mjs, unit-tested via node --test). */
declare function formatUsd(value: number | null | undefined): string;
declare function formatCompact(value: number | null | undefined): string;
declare function formatPct(pct: number | null | undefined): string;
declare function changeVariant(
    pct: number | null | undefined,
): "success" | "danger" | "secondary";
declare function timeLabel(ms: number): string;
declare function pushCapped<T>(items: readonly T[], item: T, cap: number): T[];
export { formatUsd, formatCompact, formatPct, changeVariant, timeLabel, pushCapped };
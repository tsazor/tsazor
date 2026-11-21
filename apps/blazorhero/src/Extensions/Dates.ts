import type { CultureInfo } from "@tsazor/runtime";

/**
 * `date.ToString()` / `ToString("G", culture)`: the short date (the whole year, as .NET's `d`) and the long time, a
 * space between — Intl's own date-and-time joiner differs (`21/10/2026، 8:29` in Arabic).
 */
export function formatGeneral(value: string | Date, culture: CultureInfo): string {
    const date = typeof value === "string" ? new Date(value) : value;
    return `${culture.formatDate(date, { year: "numeric", month: "numeric", day: "numeric" })} ${culture.formatDate(date, { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
}

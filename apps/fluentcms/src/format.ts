/** A date and time from the API (ISO 8601) in the user's locale, as Blazor's `DateTime.ToString()` does; "" for none. */
export function dateTime(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

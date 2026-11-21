import { formatValue, parseValue } from "@tsazor/runtime";

/** What a date field's form view edits: FluentCMS's Date, Time and DateTime pickers. */
export type DateInputKind = "date" | "time" | "datetime-local";

const INPUT_FORMATS: Readonly<Record<DateInputKind, string>> = {
    date: "yyyy-MM-dd",
    time: "HH:mm",
    "datetime-local": "yyyy-MM-ddTHH:mm",
};

/** How FluentCMS stores a date (.NET's DateTime as JSON, local, without a zone). */
const STORED = "yyyy-MM-ddTHH:mm:ss";

/**
 * A stored date as a local Date; undefined for none. What we send is ISO (with a zone it names an instant; a
 * date alone is local midnight, where `new Date` would take UTC). What FluentCMS sends back is
 * DateTime.ToString() in the server's culture: invariant here, `MM/dd/yyyy HH:mm:ss` (.NET's "G"), as the
 * backend runs with invariant globalization (port-fluentcms.md, U2).
 */
export function storedDate(value: string | null | undefined): Date | undefined {
    if (!value) return undefined;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }
    const parsed = parseValue(value, "G");
    return parsed instanceof Date ? parsed : undefined;
}

/** A stored date as the text an input of `kind` edits; "" for none. */
export function dateInputText(value: string | null, kind: DateInputKind): string {
    const date = storedDate(value);
    return date === undefined ? "" : formatValue(date, INPUT_FORMATS[kind]);
}

/** An input's text as FluentCMS stores it; a time keeps the date it had (today for none); null when cleared. */
export function fromDateInput(text: string, kind: DateInputKind, previous: string | null): string | null {
    if (text === "") return null;
    if (kind === "date") return `${text}T00:00:00`;
    if (kind === "datetime-local") return text.length === 16 ? `${text}:00` : text;
    const base = storedDate(previous) ?? new Date();
    return `${formatValue(base, "yyyy-MM-dd")}T${text.length === 5 ? `${text}:00` : text}`;
}

/** A stored date as the content list shows it: in the field's .NET format, else the user's locale. */
export function dateText(value: string | null, format: string | null): string {
    const date = storedDate(value);
    if (date === undefined) return "";
    return format ? formatValue(date, format) : date.toLocaleString();
}

/** A local date as FluentCMS stores it. */
export function storedText(date: Date): string {
    return formatValue(date, STORED);
}

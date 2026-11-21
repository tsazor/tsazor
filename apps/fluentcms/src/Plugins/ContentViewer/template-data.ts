import { storedDate } from "../Admin/ContentTypeManagement/date-values";

/**
 * A content's data as FluentCMS's templates see it. Its API client reads the data with
 * DictionaryJsonConverter, which makes a DateTime of every string that DateTime.TryParse accepts, and
 * Scriban writes a DateTime as `09 Jun 2024`. Here the dates are the strings FluentCMS sends for them
 * (storedDate: ISO, or .NET's "G").
 */
export function templateData(value: unknown): unknown {
    if (typeof value === "string") return storedDate(value) ?? value;
    if (Array.isArray(value)) return value.map(templateData);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, templateData(item)]));
    }
    return value;
}

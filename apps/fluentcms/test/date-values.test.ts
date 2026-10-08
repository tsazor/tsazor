import { describe, expect, it } from "vitest";
import { dateInputText, dateText, fromDateInput, storedDate, storedText } from "../src/Plugins/Admin/ContentTypeManagement/date-values";

describe("a date field's values (FluentCMS stores .NET DateTimes)", () => {
    const stored = "2024-06-12T19:23:40";

    it("reads a stored date-time in local time, and a date alone as local midnight", () => {
        expect(storedDate(stored)).toEqual(new Date(2024, 5, 12, 19, 23, 40));
        expect(storedDate("2024-06-12")).toEqual(new Date(2024, 5, 12));
        expect(storedDate(null)).toBeUndefined();
        expect(storedDate("not a date")).toBeUndefined();
        // What FluentCMS sends back: DateTime.ToString(), invariant (.NET's "G").
        expect(storedDate("06/12/2024 19:23:40")).toEqual(new Date(2024, 5, 12, 19, 23, 40));
        expect(dateText("06/12/2024 00:00:00", "dddd, dd MMMM yyyy")).toBe("Wednesday, 12 June 2024");
    });

    it("gives each picker its text, and stores what it gives back", () => {
        expect(["date", "time", "datetime-local"].map((kind) => dateInputText(stored, kind as never))).toEqual(["2024-06-12", "19:23", "2024-06-12T19:23"]);
        expect(fromDateInput("2024-07-01", "date", stored)).toBe("2024-07-01T00:00:00");
        expect(fromDateInput("2024-07-01T08:15", "datetime-local", stored)).toBe("2024-07-01T08:15:00");
        // A time keeps the date it had.
        expect(fromDateInput("08:15", "time", stored)).toBe("2024-06-12T08:15:00");
        expect(fromDateInput("", "date", stored)).toBeNull();
    });

    it("shows a stored date in the field's .NET format", () => {
        expect(dateText(stored, "dddd, dd MMMM yyyy")).toBe("Wednesday, 12 June 2024");
        expect(dateText(stored, "hh:mm tt")).toBe("07:23 PM");
        expect(dateText(null, "yyyy")).toBe("");
        expect(storedText(new Date(2024, 5, 12, 19, 23, 40))).toBe(stored);
    });
});

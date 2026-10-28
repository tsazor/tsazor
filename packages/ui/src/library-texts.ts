import { formatMessage, inject, StringLocalizer } from "@tsazor/runtime";

/**
 * The component library's own texts — a dialog's "Close", the paginator's "Page 2 of 7" — by name, with their
 * English wording. Each has the reserved key `tsazor.ui.<name>` (`libraryTextKey`): an entry under that key in the
 * app's string tables localizes the text in every component that shows it, as the `tsazor.validation.*` keys do for
 * the validation messages (MudBlazor's MudLocalizer, Fluent UI Blazor's IFluentLocalizer). A component's own text
 * parameter (`emptyText`, `labels`, …) still wins over both. `{name}` placeholders take the values the component
 * passes. A text that depends on a count has one entry per plural category of `Intl.PluralRules` — `….one`,
 * `….other`, and in a table also `….few`, `….many`, … as the language needs them.
 */
export const libraryTextDefaults = catalog({
  // Shared by several components.
  "close": "Close",
  "remove": "Remove {name}",
  "loading": "Loading…",
  "progress": "Progress",
  "noEntries": "No entries",

  "pagination.label": "Pagination",
  "pagination.first": "First page",
  "pagination.previous": "Previous page",
  "pagination.next": "Next page",
  "pagination.last": "Last page",
  "pagination.goTo": "Go to page {page}",
  // The Bootstrap skin's Pagination writes these on its buttons.
  "pagination.previousText": "Previous",
  "pagination.nextText": "Next",

  "paginator.label": "Pages",
  "paginator.page": "Page {page} of {pages}",
  "paginator.items.one": "{count} item",
  "paginator.items.other": "{count} items",
  "paginator.pageSize": "Rows per page",

  "dataGrid.selectAll": "Select all rows",
  "dataGrid.selected": "Selected",
  "dataGrid.selectRow": "Select row {row}",
  // A DetailsColumn's toggle (MudDataGrid's HierarchyColumn): its row's name when the column gives one. The label
  // stays while the details show (aria-expanded says so); the hide texts are no longer used.
  "dataGrid.showDetails": "Show details",
  "dataGrid.hideDetails": "Hide details",
  "dataGrid.showDetailsOf": "Show details of {name}",
  "dataGrid.hideDetailsOf": "Hide details of {name}",
  "dataGrid.columnOptions": "Column options",
  "dataGrid.resize": "Resize the column (arrow keys, Shift makes a bigger step)",
  "dataGrid.reorder": "Move the column (arrow keys, or drag it)",
  // The grid's inline edit: the edited row's key handling belongs to the skin.
  "dataGrid.editCommit": "Commit the edit (Enter)",
  "dataGrid.editCancel": "Cancel the edit (Escape)",
  // The grid's status after a load or a filter, for a screen reader.
  "dataGrid.results.one": "{count} result",
  "dataGrid.results.other": "{count} results",
  "dataGrid.groupCount.one": "{count} row",
  "dataGrid.groupCount.other": "{count} rows",

  "schedule.label": "Scheduler",
  "schedule.previous": "Previous",
  "schedule.next": "Next",
  "schedule.today": "Today",
  "schedule.month": "Month",
  "schedule.week": "Week",
  "schedule.day": "Day",
  "schedule.allDay": "All day",
  "schedule.appointment": "{appointment}, {time}",
  "schedule.appointmentHours": "{start} to {end}",
  "schedule.resize": "Resize the appointment (arrow keys)",
  "schedule.more": "{count} more",

  "chat.label": "Chat messages",
  // A message's speaker: the mark on its bubble, and the name a screen reader hears before its text.
  "chat.userMark": "Y",
  "chat.assistantMark": "A",
  "chat.user": "You",
  "chat.assistant": "Assistant",
  "prompt.label": "Message",
  "prompt.send": "Send",
  // A PivotDataGrid's own columns.
  "pivot.rows": "Rows",
  "pivot.total": "Total",
  // The built-in column filter (design-extended-library.md §2.1).
  "dataGrid.filterOperator": "Filter operator",
  "dataGrid.filterValue": "Filter value",
  "dataGrid.filterApply": "Apply filter",
  "dataGrid.filterClear": "Clear filter",
  "dataGrid.operator.contains": "contains",
  "dataGrid.operator.notContains": "does not contain",
  "dataGrid.operator.startsWith": "starts with",
  "dataGrid.operator.endsWith": "ends with",
  "dataGrid.operator.equals": "equals",
  "dataGrid.operator.notEquals": "does not equal",
  "dataGrid.operator.greaterThan": "greater than",
  "dataGrid.operator.greaterThanOrEqual": "greater than or equal",
  "dataGrid.operator.lessThan": "less than",
  "dataGrid.operator.lessThanOrEqual": "less than or equal",
  "dataGrid.operator.empty": "is empty",
  "dataGrid.operator.notEmpty": "is not empty",

  "sidebarNav.label": "Main navigation",
  "scrollToTop.label": "Back to top",
  "breadcrumb.label": "breadcrumb",
  "splitter.resize": "Resize",
  "overflow.more.one": "{count} more: {names}",
  "overflow.more.other": "{count} more: {names}",

  "wizard.label": "Steps",
  "wizard.previous": "Previous",
  "wizard.next": "Next",
  "wizard.done": "Done",

  "carousel.label": "Slides",
  // aria-roledescription: what a screen reader calls the carousel and each slide.
  "carousel.roleDescription": "carousel",
  "carousel.slideRoleDescription": "slide",
  "carousel.previous": "Previous slide",
  "carousel.next": "Next slide",
  "carousel.slide": "{position} of {count}",
  "carousel.bullet": "Slide {position}",
  "carousel.pause": "Stop the slides",
  "carousel.play": "Start the slides",

  "calendar.previousMonth": "Previous month",
  "calendar.nextMonth": "Next month",
  "calendar.previousYear": "Previous year",
  "calendar.nextYear": "Next year",
  "calendar.previousYears": "Previous years",
  "calendar.nextYears": "Next years",
  "datePicker.button": "Choose date",
  "dateRangePicker.button": "Choose dates",
  "dateRangePicker.start": "Start date",
  "dateRangePicker.end": "End date",
  // A date field whose text is no date (the DateRangePicker; Blazor InputDate's ParsingErrorMessage).
  "dateField.notADate": "The {field} field must be a date.",
  "timePicker.button": "Choose time",
  // A date or time field's placeholder, in the locale's order: "DD.MM.YYYY" (German writes "TT.MM.JJJJ").
  "dateField.year": "YYYY",
  "dateField.month": "MM",
  "dateField.day": "DD",
  "timeField.hour": "hh",
  "timeField.minute": "mm",
  // A number field whose text is no number (Blazor InputNumber's ParsingErrorMessage, "The {0} field must be a number.").
  "numberField.notANumber": "The {field} field must be a number.",

  "colorPicker.label": "Color",
  "colorPicker.button": "Choose color",
  "colorPicker.swatch": "{color}, {hex}",
  "colorPicker.square": "Saturation and brightness",
  "colorPicker.squareRoleDescription": "2D slider",
  "colorPicker.squareValue": "Saturation {saturation}%, brightness {brightness}%",
  // The square with the color it makes (the hsv view shows no hex of its own): "…: dark blue, #1f3c99".
  "colorPicker.squareColorValue": "Saturation {saturation}%, brightness {brightness}%: {color}",
  "colorPicker.hue": "Hue",
  "colorPicker.hueValue": "{hue} degrees, {color}",
  // A color's name for a screen reader (describeColor): a hue, lighter or darker.
  "color.light": "light {color}",
  "color.dark": "dark {color}",
  "color.black": "black",
  "color.white": "white",
  "color.gray": "gray",
  "color.lightGray": "light gray",
  "color.darkGray": "dark gray",
  "color.red": "red",
  "color.orange": "orange",
  "color.yellow": "yellow",
  "color.lime": "lime",
  "color.green": "green",
  "color.teal": "teal",
  "color.cyan": "cyan",
  "color.blue": "blue",
  "color.purple": "purple",
  "color.magenta": "magenta",
  "color.pink": "pink",

  "fileUpload.dropFile": "Drop a file here, or click to choose",
  "fileUpload.dropFiles": "Drop files here, or click to choose",
  "fileUpload.progressLabel": "Upload progress",
  "fileUpload.loading": "Loading...",
  "fileUpload.progress": "Loading {number}/{count} - {name}",
  "fileUpload.completed": "Completed",
  "fileUpload.canceled": "Canceled",
  // The errorMessage of onFileError ("file-count-exceeded", "maximum-size-reached"), Fluent UI Blazor's wording.
  "fileUpload.fileCountExceeded": "The maximum number of files has been exceeded.",
  "fileUpload.fileSizeExceeded": "The maximum size allowed is reached",

  "rating.label": "Rating",
  "rating.stars.one": "{count} star",
  "rating.stars.other": "{count} stars",
  "rating.display": "Rated {value} out of {max}",
  "rating.displayWithCount": "Rated {value} out of {max}, {ratings}",
  "rating.ratings.one": "{count} rating",
  "rating.ratings.other": "{count} ratings",

  "sortableList.instructions": "Press Space to pick the item up, the arrow keys to move it, Space to put it down, Escape to put it back.",
  "sortableList.grabbed": "{item}, picked up. Position {position} of {count}.",
  "sortableList.moved": "{item}, position {position} of {count}.",
  "sortableList.movedToList": "{item}, moved to {list}, position {position} of {count}.",
  "sortableList.dropped": "{item}, put down at position {position} of {count}.",
  "sortableList.canceled": "{item}, put back.",
  // @tsazor/charts: the names a screen reader hears, and the words of a chart's description.
  "chart.label": "Chart",
  "chart.table": "The data",
  "chart.line": "Line chart",
  "chart.area": "Area chart",
  "chart.bar": "Bar chart",
  "chart.stackedBar": "Stacked bar chart",
  "chart.donut": "Donut chart",
  "chart.pie": "Pie chart",
  "chart.of": "{chart} of {series}",
  "chart.slice": "{label} {value} ({share}%)",
  "chart.noValues": "{series}: no values",
  "chart.at": "{series} at {value}",
  "chart.range": "{series} from {low} to {high}",
  "chart.summary": "{chart}: {parts}.",
  "chart.summaryOver": "{chart}: {parts}, over {first} to {last}.",
  "sparkline.label": "Trend",
  "sparkline.noValues": "{label}: no values",
  "sparkline.summary": "{label}: from {low} to {high}, now {last}",
});

/** The catalog's type: its names, each a `string` — the English wording is a value, not part of the type. */
function catalog<Texts extends Record<string, string>>(texts: Texts): { readonly [Name in keyof Texts]: string } {
  return texts;
}

/** The name of a library text: "close", "paginator.page", … */
export type LibraryText = keyof typeof libraryTextDefaults;

/** The name of a library text that depends on a count ("rating.stars"): its entries end in a plural category. */
export type LibraryPluralText = LibraryText extends infer Name ? (Name extends `${infer Base}.other` ? Base : never) : never;

/** A library text's key in the app's string tables: "tsazor.ui.paginator.page". */
export function libraryTextKey(text: string): string {
  return `tsazor.ui.${text}`;
}

/** A library text in the localizer's current culture — the table's entry, else the English text — formatted. */
export function libraryText(localizer: StringLocalizer, text: LibraryText, params?: Record<string, unknown>): string {
  return formatMessage(localizer.raw(libraryTextKey(text)) ?? libraryTextDefaults[text], params);
}

/**
 * A library text for `count` things: the entry of the count's plural category in the current culture
 * (`Intl.PluralRules`: "one", "few", "many", "other", …), else its "other" entry, else the English text.
 * `{count}` is the count as the culture writes it.
 */
export function libraryPlural(localizer: StringLocalizer, text: LibraryPluralText, count: number, params?: Record<string, unknown>): string {
  const culture = localizer.culture || "en";
  const category = new Intl.PluralRules(culture).select(count);
  const values = { count: new Intl.NumberFormat(culture).format(count), ...params };
  const own = localizer.raw(libraryTextKey(`${text}.${category}`)) ?? localizer.raw(libraryTextKey(`${text}.other`));
  return own !== undefined ? formatMessage(own, values) : englishPlural(text, count, values);
}

/** The English entry for `count` ("one" or "other"), formatted with `values` (`{count}` as given). */
function englishPlural(text: LibraryPluralText, count: number, values: Record<string, unknown>): string {
  const category = new Intl.PluralRules("en").select(count) === "one" ? "one" : "other";
  return formatMessage(libraryTextDefaults[`${text}.${category}` as LibraryText], values);
}

/**
 * What `libraryTexts()` returns: a library text by name (`t("close")`), one for a count (`t.plural(…)`), and the
 * locale dates and numbers format in (`t.locale`).
 */
export interface LibraryTexts {
  (text: LibraryText, params?: Record<string, unknown>): string;
  plural(text: LibraryPluralText, count: number, params?: Record<string, unknown>): string;
  /**
   * The locale of dates and numbers: the CultureService's culture (Blazor's CurrentCulture), else — for the invariant
   * culture — the page's `lang`, else the browser's language. A component's `locale` parameter overrides it.
   */
  readonly locale: string;
}

/** The locale without a culture: the page's `lang`, else the browser's language, else "en-US". */
export function pageLocale(): string {
  if (typeof document !== "undefined" && document.documentElement.lang) return document.documentElement.lang;
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-US";
}

/** A LibraryTexts from its parts; `locale` stays a getter, asked on every read (Object.assign would copy its value). */
function textsOf(
  text: (text: LibraryText, params?: Record<string, unknown>) => string,
  plural: LibraryTexts["plural"],
  locale: () => string,
): LibraryTexts {
  return Object.defineProperties(text, {
    plural: { value: plural },
    locale: { get: locale },
  }) as LibraryTexts;
}

/** The library texts in English, without a localizer: what a label builder (`carouselLabelsFrom`, …) gives outside a component. */
export const englishLibraryTexts: LibraryTexts = textsOf(
  (text, params) => formatMessage(libraryTextDefaults[text], params),
  (text, count, params) => englishPlural(text, count, { count: new Intl.NumberFormat("en").format(count), ...params }),
  pageLocale,
);

/**
 * A component's library texts: `private readonly t = libraryTexts();` in a field initializer, then `@t("close")`.
 * Resolving the StringLocalizer while the component is constructed makes it render again when the culture changes
 * or a table arrives (the E8 auto-render).
 */
export function libraryTexts(): LibraryTexts {
  const localizer = inject(StringLocalizer);
  return textsOf(
    (text, params) => libraryText(localizer, text, params),
    (text, count, params) => libraryPlural(localizer, text, count, params),
    () => localizer.culture || pageLocale(),
  );
}

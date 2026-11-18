import type { LibraryText } from "../library-texts.js";

/** The kinds of the built-in validation rules, as their reserved keys name them (`tsazor.validation.<kind>`). */
export type ValidationText =
  | "required"
  | "minLength"
  | "maxLength"
  | "stringLength"
  | "stringLengthIncludingMinimum"
  | "range"
  | "precision"
  | "emailAddress"
  | "regularExpression"
  | "compare";

/** A complete table of the reserved keys: every library text and every built-in validation message. */
export type FrameworkTexts = { readonly [Name in `tsazor.ui.${LibraryText}`]: string } & {
  readonly [Name in `tsazor.validation.${ValidationText}`]: string;
};

/**
 * Tsazor's own texts in German (de): the components' library texts (`tsazor.ui.*`) and the built-in validation
 * messages (`tsazor.validation.*`, in .NET's German wording). Spread it into the app's German table — the app's own
 * entries after it win:
 *
 * ```ts
 * import { germanFrameworkTexts } from "@tsazor/ui/texts/de";
 * export default { ...germanFrameworkTexts, "Orders.Title": "Bestellungen" } satisfies StringTable;
 * ```
 *
 * A module of its own, so an app without German doesn't bundle it. docs/library-texts.md lists every key with the
 * component that shows it.
 */
export const germanFrameworkTexts: FrameworkTexts = {
  "tsazor.ui.close": "Schließen",
  "tsazor.ui.remove": "{name} entfernen",
  "tsazor.ui.loading": "Wird geladen…",
  "tsazor.ui.progress": "Fortschritt",
  "tsazor.ui.noEntries": "Keine Einträge",

  "tsazor.ui.pagination.label": "Seitennavigation",
  "tsazor.ui.pagination.first": "Erste Seite",
  "tsazor.ui.pagination.previous": "Vorherige Seite",
  "tsazor.ui.pagination.next": "Nächste Seite",
  "tsazor.ui.pagination.last": "Letzte Seite",
  "tsazor.ui.pagination.goTo": "Zu Seite {page}",
  "tsazor.ui.pagination.previousText": "Zurück",
  "tsazor.ui.pagination.nextText": "Weiter",

  "tsazor.ui.paginator.label": "Seiten",
  "tsazor.ui.paginator.page": "Seite {page} von {pages}",
  "tsazor.ui.paginator.items.one": "{count} Eintrag",
  "tsazor.ui.paginator.items.other": "{count} Einträge",
  "tsazor.ui.paginator.pageSize": "Zeilen pro Seite",

  "tsazor.ui.dataGrid.selectAll": "Alle Zeilen auswählen",
  "tsazor.ui.dataGrid.selected": "Ausgewählt",
  "tsazor.ui.dataGrid.selectRow": "Zeile {row} auswählen",
  "tsazor.ui.dataGrid.showDetails": "Details anzeigen",
  "tsazor.ui.dataGrid.hideDetails": "Details ausblenden",
  "tsazor.ui.dataGrid.showDetailsOf": "Details zu {name} anzeigen",
  "tsazor.ui.dataGrid.hideDetailsOf": "Details zu {name} ausblenden",
  "tsazor.ui.dataGrid.columnOptions": "Spaltenoptionen",
  "tsazor.ui.dataGrid.resize": "Spaltenbreite ändern (Pfeiltasten, mit Umschalt in größeren Schritten)",
  "tsazor.ui.dataGrid.reorder": "Spalte verschieben (Pfeiltasten oder ziehen)",
  "tsazor.ui.dataGrid.editCommit": "Änderung übernehmen (Eingabe)",
  "tsazor.ui.dataGrid.editCancel": "Änderung verwerfen (Escape)",
  "tsazor.ui.dataGrid.results.one": "{count} Ergebnis",
  "tsazor.ui.dataGrid.results.other": "{count} Ergebnisse",
  "tsazor.ui.dataGrid.groupCount.one": "{count} Zeile",
  "tsazor.ui.dataGrid.groupCount.other": "{count} Zeilen",

  "tsazor.ui.schedule.label": "Terminplaner",
  "tsazor.ui.schedule.previous": "Zurück",
  "tsazor.ui.schedule.next": "Weiter",
  "tsazor.ui.schedule.today": "Heute",
  "tsazor.ui.schedule.month": "Monat",
  "tsazor.ui.schedule.week": "Woche",
  "tsazor.ui.schedule.day": "Tag",
  "tsazor.ui.schedule.allDay": "Ganztägig",
  "tsazor.ui.schedule.appointment": "{appointment}, {time}",
  "tsazor.ui.schedule.appointmentHours": "{start} bis {end}",
  "tsazor.ui.schedule.resize": "Termindauer ändern (Pfeiltasten)",
  "tsazor.ui.schedule.more": "{count} weitere",

  "tsazor.ui.chat.label": "Chatnachrichten",
  "tsazor.ui.chat.userMark": "S",
  "tsazor.ui.chat.assistantMark": "A",
  "tsazor.ui.chat.user": "Sie",
  "tsazor.ui.chat.assistant": "Assistent",
  "tsazor.ui.prompt.label": "Nachricht",
  "tsazor.ui.prompt.send": "Senden",
  "tsazor.ui.pivot.rows": "Zeilen",
  "tsazor.ui.pivot.total": "Gesamt",
  "tsazor.ui.dataGrid.filterOperator": "Filteroperator",
  "tsazor.ui.dataGrid.filterValue": "Filterwert",
  "tsazor.ui.dataGrid.filterApply": "Filter anwenden",
  "tsazor.ui.dataGrid.filterClear": "Filter entfernen",
  "tsazor.ui.dataGrid.operator.contains": "enthält",
  "tsazor.ui.dataGrid.operator.notContains": "enthält nicht",
  "tsazor.ui.dataGrid.operator.startsWith": "beginnt mit",
  "tsazor.ui.dataGrid.operator.endsWith": "endet mit",
  "tsazor.ui.dataGrid.operator.equals": "ist gleich",
  "tsazor.ui.dataGrid.operator.notEquals": "ist ungleich",
  "tsazor.ui.dataGrid.operator.greaterThan": "größer als",
  "tsazor.ui.dataGrid.operator.greaterThanOrEqual": "größer oder gleich",
  "tsazor.ui.dataGrid.operator.lessThan": "kleiner als",
  "tsazor.ui.dataGrid.operator.lessThanOrEqual": "kleiner oder gleich",
  "tsazor.ui.dataGrid.operator.empty": "ist leer",
  "tsazor.ui.dataGrid.operator.notEmpty": "ist nicht leer",

  "tsazor.ui.sidebarNav.label": "Hauptnavigation",
  "tsazor.ui.scrollToTop.label": "Nach oben",
  "tsazor.ui.breadcrumb.label": "Brotkrumennavigation",
  "tsazor.ui.splitter.resize": "Größe ändern",
  "tsazor.ui.overflow.more.one": "{count} weiteres: {names}",
  "tsazor.ui.overflow.more.other": "{count} weitere: {names}",

  "tsazor.ui.wizard.label": "Schritte",
  "tsazor.ui.wizard.previous": "Zurück",
  "tsazor.ui.wizard.next": "Weiter",
  "tsazor.ui.wizard.done": "Fertig",
  "tsazor.ui.wizard.completed": "abgeschlossen",

  "tsazor.ui.carousel.label": "Folien",
  "tsazor.ui.carousel.roleDescription": "Karussell",
  "tsazor.ui.carousel.slideRoleDescription": "Folie",
  "tsazor.ui.carousel.previous": "Vorherige Folie",
  "tsazor.ui.carousel.next": "Nächste Folie",
  "tsazor.ui.carousel.slide": "{position} von {count}",
  "tsazor.ui.carousel.bullet": "Folie {position}",
  "tsazor.ui.carousel.pause": "Folien anhalten",
  "tsazor.ui.carousel.play": "Folien abspielen",

  "tsazor.ui.calendar.previousMonth": "Vorheriger Monat",
  "tsazor.ui.calendar.nextMonth": "Nächster Monat",
  "tsazor.ui.calendar.previousYear": "Vorheriges Jahr",
  "tsazor.ui.calendar.nextYear": "Nächstes Jahr",
  "tsazor.ui.calendar.previousYears": "Vorherige Jahre",
  "tsazor.ui.calendar.nextYears": "Nächste Jahre",
  "tsazor.ui.datePicker.button": "Datum auswählen",
  "tsazor.ui.datePicker.format": "Format {pattern}",
  "tsazor.ui.dateRangePicker.button": "Zeitraum auswählen",
  "tsazor.ui.dateRangePicker.start": "Startdatum",
  "tsazor.ui.dateRangePicker.end": "Enddatum",
  "tsazor.ui.dateField.notADate": "Das Feld {field} muss ein Datum sein.",
  "tsazor.ui.timePicker.button": "Uhrzeit auswählen",
  "tsazor.ui.dateField.year": "JJJJ",
  "tsazor.ui.dateField.month": "MM",
  "tsazor.ui.dateField.day": "TT",
  "tsazor.ui.timeField.hour": "hh",
  "tsazor.ui.timeField.minute": "mm",
  "tsazor.ui.numberField.notANumber": "Das Feld {field} muss eine Zahl sein.",

  "tsazor.ui.colorPicker.label": "Farbe",
  "tsazor.ui.colorPicker.button": "Farbe auswählen",
  "tsazor.ui.colorPicker.swatch": "{color}, {hex}",
  "tsazor.ui.colorPicker.square": "Sättigung und Helligkeit",
  "tsazor.ui.colorPicker.squareRoleDescription": "2D-Schieberegler",
  "tsazor.ui.colorPicker.squareValue": "Sättigung {saturation} %, Helligkeit {brightness} %",
  "tsazor.ui.colorPicker.squareColorValue": "Sättigung {saturation} %, Helligkeit {brightness} %: {color}",
  "tsazor.ui.colorPicker.hue": "Farbton",
  "tsazor.ui.colorPicker.hueValue": "{hue} Grad, {color}",
  "tsazor.ui.color.light": "helles {color}",
  "tsazor.ui.color.dark": "dunkles {color}",
  "tsazor.ui.color.black": "Schwarz",
  "tsazor.ui.color.white": "Weiß",
  "tsazor.ui.color.gray": "Grau",
  "tsazor.ui.color.lightGray": "Hellgrau",
  "tsazor.ui.color.darkGray": "Dunkelgrau",
  "tsazor.ui.color.red": "Rot",
  "tsazor.ui.color.orange": "Orange",
  "tsazor.ui.color.yellow": "Gelb",
  "tsazor.ui.color.lime": "Hellgrün",
  "tsazor.ui.color.green": "Grün",
  "tsazor.ui.color.teal": "Blaugrün",
  "tsazor.ui.color.cyan": "Cyan",
  "tsazor.ui.color.blue": "Blau",
  "tsazor.ui.color.purple": "Violett",
  "tsazor.ui.color.magenta": "Magenta",
  "tsazor.ui.color.pink": "Rosa",

  "tsazor.ui.fileUpload.dropFile": "Datei hier ablegen oder klicken, um sie auszuwählen",
  "tsazor.ui.fileUpload.dropFiles": "Dateien hier ablegen oder klicken, um sie auszuwählen",
  "tsazor.ui.fileUpload.progressLabel": "Upload-Fortschritt",
  "tsazor.ui.fileUpload.loading": "Wird geladen…",
  "tsazor.ui.fileUpload.progress": "Wird geladen {number}/{count} – {name}",
  "tsazor.ui.fileUpload.completed": "Abgeschlossen",
  "tsazor.ui.fileUpload.canceled": "Abgebrochen",
  "tsazor.ui.fileUpload.fileCountExceeded": "Die maximale Anzahl an Dateien wurde überschritten.",
  "tsazor.ui.fileUpload.fileSizeExceeded": "Die maximal zulässige Größe wurde erreicht.",
  "tsazor.ui.fileUpload.fileError": "{name}: {message}",

  "tsazor.ui.rating.label": "Bewertung",
  "tsazor.ui.rating.stars.one": "{count} Stern",
  "tsazor.ui.rating.stars.other": "{count} Sterne",
  "tsazor.ui.rating.display": "Bewertet mit {value} von {max}",
  "tsazor.ui.rating.displayWithCount": "Bewertet mit {value} von {max}, {ratings}",
  "tsazor.ui.rating.ratings.one": "{count} Bewertung",
  "tsazor.ui.rating.ratings.other": "{count} Bewertungen",

  "tsazor.ui.sortableList.instructions": "Leertaste nimmt den Eintrag auf, die Pfeiltasten verschieben ihn, Leertaste legt ihn ab, Escape legt ihn zurück.",
  "tsazor.ui.sortableList.grabbed": "{item}, aufgenommen. Position {position} von {count}.",
  "tsazor.ui.sortableList.moved": "{item}, Position {position} von {count}.",
  "tsazor.ui.sortableList.movedToList": "{item}, verschoben nach {list}, Position {position} von {count}.",
  "tsazor.ui.sortableList.dropped": "{item}, abgelegt an Position {position} von {count}.",
  "tsazor.ui.sortableList.canceled": "{item}, zurückgelegt.",
  "tsazor.ui.chart.label": "Diagramm",
  "tsazor.ui.chart.table": "Die Daten",
  "tsazor.ui.chart.line": "Liniendiagramm",
  "tsazor.ui.chart.area": "Flächendiagramm",
  "tsazor.ui.chart.bar": "Balkendiagramm",
  "tsazor.ui.chart.stackedBar": "Gestapeltes Balkendiagramm",
  "tsazor.ui.chart.donut": "Ringdiagramm",
  "tsazor.ui.chart.pie": "Kreisdiagramm",
  "tsazor.ui.chart.of": "{chart} zu {series}",
  "tsazor.ui.chart.slice": "{label} {value} ({share} %)",
  "tsazor.ui.chart.noValues": "{series}: keine Werte",
  "tsazor.ui.chart.at": "{series} bei {value}",
  "tsazor.ui.chart.range": "{series} von {low} bis {high}",
  "tsazor.ui.chart.summary": "{chart}: {parts}.",
  "tsazor.ui.chart.summaryOver": "{chart}: {parts}, über {first} bis {last}.",
  "tsazor.ui.sparkline.label": "Verlauf",
  "tsazor.ui.sparkline.noValues": "{label}: keine Werte",
  "tsazor.ui.sparkline.summary": "{label}: von {low} bis {high}, aktuell {last}",

  // .NET's German texts of the DataAnnotations attributes, with the named placeholders of the reserved keys.
  "tsazor.validation.required": "Das Feld {displayName} ist erforderlich.",
  "tsazor.validation.minLength": "Das Feld {displayName} muss eine Zeichenfolge oder ein Array mit einer Mindestlänge von {min} sein.",
  "tsazor.validation.maxLength": "Das Feld {displayName} muss eine Zeichenfolge oder ein Array mit einer maximalen Länge von {max} sein.",
  "tsazor.validation.stringLength": "Das Feld {displayName} muss eine Zeichenfolge mit einer maximalen Länge von {max} sein.",
  "tsazor.validation.stringLengthIncludingMinimum": "Das Feld {displayName} muss eine Zeichenfolge mit einer Mindestlänge von {min} und einer maximalen Länge von {max} sein.",
  "tsazor.validation.range": "Das Feld {displayName} muss zwischen {min} und {max} liegen.",
  "tsazor.validation.precision": "Das Feld {displayName} darf höchstens {precision} Stellen haben, davon {scale} Nachkommastellen.",
  "tsazor.validation.emailAddress": "Das Feld {displayName} ist keine gültige E-Mail-Adresse.",
  "tsazor.validation.regularExpression": "Das Feld {displayName} muss mit dem regulären Ausdruck \"{pattern}\" übereinstimmen.",
  "tsazor.validation.compare": "{displayName} und {other} stimmen nicht überein.",
};

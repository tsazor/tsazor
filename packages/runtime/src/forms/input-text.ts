import { InputBase } from "./input-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";

/** Blazor's InputText: single-line string input. */
export class InputText extends InputBase<string> {
  /**
   * Binds on every keystroke (MudBlazor's `Immediate`; a superset of Blazor's InputText, which binds on `change`):
   * the value follows `input`, the form hears of the field change on `change` as before — and while the field has a
   * message, on every keystroke, so the message goes as soon as the value is fixed.
   */
  @Parameter() immediate = false;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "input");
    b.addAttribute(this.nextSequence(), "value", this.currentValue ?? "");
    this.applyCommonAttributes(b);
    const valueOf = (e: Event): string => (e.target as HTMLInputElement).value;
    if (this.immediate) this.addImmediateHandlers(b, valueOf);
    else b.addEventHandler(this.nextSequence(), "onchange", this.changeHandler(valueOf));
    this.captureElement(b);
    b.closeElement();
  }
}

/** Blazor's InputTextArea: multi-line string input. */
export class InputTextArea extends InputBase<string> {
  /** Binds on every keystroke, as InputText's `immediate`. */
  @Parameter() immediate = false;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "textarea");
    b.addAttribute(this.nextSequence(), "value", this.currentValue ?? "");
    this.applyCommonAttributes(b);
    const valueOf = (e: Event): string => (e.target as HTMLTextAreaElement).value;
    if (this.immediate) this.addImmediateHandlers(b, valueOf);
    else b.addEventHandler(this.nextSequence(), "onchange", this.changeHandler(valueOf));
    this.captureElement(b);
    b.closeElement();
  }
}

/** Blazor's InputNumber: numeric input; empty input maps to the empty string. */
export class InputNumber extends InputBase<number | string> {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "input");
    b.addAttribute(this.nextSequence(), "value", this.currentValue === undefined || this.currentValue === null ? "" : String(this.currentValue));
    b.addAttribute(this.nextSequence(), "type", "number");
    this.applyCommonAttributes(b);
    b.addEventHandler(
      this.nextSequence(),
      "onchange",
      this.changeHandler((e) => {
        const raw = (e.target as HTMLInputElement).value;
        if (raw === "") return "";
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? raw : parsed;
      }),
    );
    this.captureElement(b);
    b.closeElement();
  }
}

/** Blazor's InputCheckbox: boolean checkbox. */
export class InputCheckbox extends InputBase<boolean> {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "input");
    b.addAttribute(this.nextSequence(), "type", "checkbox");
    b.addAttribute(this.nextSequence(), "checked", this.currentValue === true);
    this.applyCommonAttributes(b);
    b.addEventHandler(this.nextSequence(), "onchange", this.changeHandler((e) => (e.target as HTMLInputElement).checked));
    this.captureElement(b);
    b.closeElement();
  }
}

/** Blazor's InputDateType: what the input edits. */
export type InputDateType = "date" | "datetime-local" | "month" | "time";

/**
 * Blazor's InputDate: a date, date-time, month or time input (`type`, Blazor's InputDateType). A Date is
 * written and read in local time, as .NET's DateTime carries no zone (`yyyy-MM-dd`, `yyyy-MM-ddTHH:mm:ss`,
 * `yyyy-MM`, `HH:mm:ss`, Blazor's formats). A string value stays a string: the input's text. A time has
 * no date, so it is always the text.
 */
export class InputDate extends InputBase<Date | string> {
  /** Blazor's `Type`: date (the default), datetime-local, month or time. */
  @Parameter() type: InputDateType = "date";

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "input");
    b.addAttribute(this.nextSequence(), "type", this.type);
    const value = this.currentValue;
    b.addAttribute(this.nextSequence(), "value", value instanceof Date ? formatDateInput(value, this.type) : (value ?? ""));
    this.applyCommonAttributes(b);
    b.addEventHandler(
      this.nextSequence(),
      "onchange",
      this.changeHandler((e) => {
        const raw = (e.target as HTMLInputElement).value;
        if (raw === "" || typeof this.currentValue === "string") return raw;
        return parseDateInput(raw, this.type) ?? raw;
      }),
    );
    this.captureElement(b);
    b.closeElement();
  }
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** A Date as an input of `type` writes it, in local time (Blazor's InputDate formats). */
export function formatDateInput(value: Date, type: InputDateType): string {
  const date = `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  switch (type) {
    case "date":
      return date;
    case "datetime-local":
      return `${date}T${time}`;
    case "month":
      return date.slice(0, 7);
    case "time":
      return time;
  }
}

/** An input's text as a local Date (`time` has no date: undefined), or undefined when it isn't one. */
function parseDateInput(text: string, type: InputDateType): Date | undefined {
  const match = /^(\d{4,})-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?)?$/.exec(text);
  if (type === "time" || match === null) return undefined;
  const [, year, month, day, hours, minutes, seconds] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day ?? 1), Number(hours ?? 0), Number(minutes ?? 0), Number(seconds ?? 0));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Blazor's InputSelect: dropdown with child content as options. */
export class InputSelect extends InputBase<string> {
  /** Option elements rendered inside the select. */
  @Parameter() childContent?: RenderFragment;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "select");
    b.addAttribute(this.nextSequence(), "value", this.currentValue ?? "");
    this.applyCommonAttributes(b);
    b.addEventHandler(this.nextSequence(), "onchange", this.changeHandler((e) => (e.target as HTMLSelectElement).value));
    this.captureElement(b);
    if (this.childContent) {
      this.childContent(b);
    }
    b.closeElement();
  }
}
import { InputBase } from "./input-base";
import { Parameter } from "../components/parameter-metadata";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree";

/** Blazor's InputText: single-line string input. */
export class InputText extends InputBase<string> {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "input");
    b.addAttribute(this.nextSequence(), "value", this.currentValue ?? "");
    this.applyCommonAttributes(b);
    b.addEventHandler(this.nextSequence(), "onchange", this.changeHandler((e) => (e.target as HTMLInputElement).value));
    b.closeElement();
  }
}

/** Blazor's InputTextArea: multi-line string input. */
export class InputTextArea extends InputBase<string> {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "textarea");
    b.addAttribute(this.nextSequence(), "value", this.currentValue ?? "");
    this.applyCommonAttributes(b);
    b.addEventHandler(this.nextSequence(), "onchange", this.changeHandler((e) => (e.target as HTMLTextAreaElement).value));
    b.closeElement();
  }
}

/** Blazor's InputNumber: numeric input; empty input maps to the empty string. */
export class InputNumber extends InputBase<number | string> {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "input");
    b.addAttribute(this.nextSequence(), "value", this.currentValue === undefined ? "" : String(this.currentValue));
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
    b.closeElement();
  }
}

/** Blazor's InputDate: date input; parses to Date when valid. */
export class InputDate extends InputBase<Date | string> {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.beginRender();
    b.openElement(this.nextSequence(), "input");
    b.addAttribute(this.nextSequence(), "type", "date");
    const value = this.currentValue;
    b.addAttribute(this.nextSequence(), "value", value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? ""));
    this.applyCommonAttributes(b);
    b.addEventHandler(
      this.nextSequence(),
      "onchange",
      this.changeHandler((e) => {
        const raw = (e.target as HTMLInputElement).value;
        if (raw === "") return "";
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? raw : parsed;
      }),
    );
    b.closeElement();
  }
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
    if (this.childContent) {
      this.childContent(b);
    }
    b.closeElement();
  }
}
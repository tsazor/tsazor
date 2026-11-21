/**
 * Input masks (MudBlazor's PatternMask, as `MudTextField Mask="@(new PatternMask("0000 0000"))"` uses it): a pattern
 * whose `0` takes a digit, `a` a letter, `*` either, and whose other characters are written in between. Typing
 * "1234" into "(000) 000-0000" gives "(123) 4"; the delimiters appear as the next character arrives.
 */

/** Options of a PatternMask (MudBlazor's). */
export interface PatternMaskOptions {
  /** Shows the pattern's open places with this character ("_": "(12_) ___-____"; `Placeholder`). */
  placeholder?: string;
  /** The value leaves the delimiters out ("1234567890"; `CleanDelimiters`). */
  cleanDelimiters?: boolean;
  /** Changes each character typed (to upper case, say; `Transformation`). */
  transform?: (char: string) => string;
}

const DIGIT = /^\p{N}$/u;
const LETTER = /^\p{L}$/u;
const TESTS: Record<string, (char: string) => boolean> = {
  "0": (char) => DIGIT.test(char),
  a: (char) => LETTER.test(char),
  "*": (char) => DIGIT.test(char) || LETTER.test(char),
};

/** A pattern mask: what to keep of what is typed, and where the delimiters go. */
export class PatternMask {
  constructor(
    readonly pattern: string,
    readonly options: PatternMaskOptions = {},
  ) {}

  /** Whether the pattern takes digits only (the field can ask for the number keyboard). */
  get numeric(): boolean {
    return [...this.pattern].every((char) => !(char in TESTS) || char === "0");
  }

  /**
   * The text as the mask writes it — without the placeholders — and the characters it took. Characters the pattern
   * can't take are skipped; a delimiter typed where it belongs is taken as the delimiter.
   */
  apply(text: string): { masked: string; raw: string } {
    const pattern = [...this.pattern];
    const input = [...text];
    const transform = this.options.transform ?? ((char: string) => char);
    let masked = "";
    let raw = "";
    let at = 0;
    for (let p = 0; p < pattern.length; p++) {
      const test = TESTS[pattern[p]!];
      if (test !== undefined) {
        while (at < input.length && !test(input[at]!)) at++;
        if (at >= input.length) break;
        const char = transform(input[at++]!);
        masked += char;
        raw += char;
        continue;
      }
      // A delimiter: only when a character the pattern takes still follows.
      const next = pattern.slice(p + 1).find((char) => char in TESTS);
      if (next === undefined || !input.slice(at).some((char) => TESTS[next]!(char))) break;
      masked += pattern[p];
      if (input[at] === pattern[p]) at++;
    }
    return { masked, raw };
  }

  /** The text as the field shows it: masked, and with the placeholder on the open places when there is one. */
  format(text: string): string {
    const { masked } = this.apply(text);
    const placeholder = this.options.placeholder;
    if (placeholder === undefined || text === "") return masked;
    const pattern = [...this.pattern];
    const filled = [...masked].length;
    return masked + pattern.slice(filled).map((char) => (char in TESTS ? placeholder : char)).join("");
  }

  /** The value of a text: masked, or its characters only with `cleanDelimiters`. */
  value(text: string): string {
    const { masked, raw } = this.apply(text);
    return this.options.cleanDelimiters ? raw : masked;
  }

  /** Where the caret goes in a masked text: after its `count`-th taken character (and the delimiters right before it). */
  caret(count: number): number {
    if (count <= 0) {
      // Before the first place, past the leading delimiters ("(|").
      const first = [...this.pattern].findIndex((char) => char in TESTS);
      return first < 0 ? 0 : first;
    }
    let taken = 0;
    const pattern = [...this.pattern];
    for (let p = 0; p < pattern.length; p++) {
      if (pattern[p]! in TESTS && ++taken === count) return p + 1;
    }
    return pattern.length;
  }
}

/** A mask from what a component takes: a PatternMask, or its pattern as text. */
export function toMask(mask: PatternMask | string | undefined): PatternMask | undefined {
  if (mask === undefined || mask === "") return undefined;
  return typeof mask === "string" ? new PatternMask(mask) : mask;
}

/**
 * Masks an input as someone types into it: the text is written again and the caret stays after the character it was
 * after. Returns the masked text.
 */
export function maskInput(input: HTMLInputElement, mask: PatternMask): string {
  const text = input.value;
  const caret = input.selectionStart ?? text.length;
  const before = mask.apply(text.slice(0, caret)).raw.length;
  const formatted = mask.format(text);
  if (formatted !== text) input.value = formatted;
  if (input.ownerDocument.activeElement === input) {
    const position = Math.min(mask.caret(before), formatted.length);
    input.setSelectionRange(position, position);
  }
  return formatted;
}

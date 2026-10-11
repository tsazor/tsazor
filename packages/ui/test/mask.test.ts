import { describe, expect, it } from "vitest";
import { maskInput, PatternMask, toMask } from "../src/mask.js";

describe("PatternMask", () => {
  const phone = new PatternMask("(000) 000-0000");

  it("writes the delimiters as the next character arrives, and skips what the pattern can't take", () => {
    expect(phone.apply("1").masked).toBe("(1");
    expect(phone.apply("123").masked).toBe("(123");
    expect(phone.apply("1234").masked).toBe("(123) 4");
    expect(phone.apply("1234567890").masked).toBe("(123) 456-7890");
    expect(phone.apply("12345678901234").masked).toBe("(123) 456-7890");
    expect(phone.apply("(123) 456-7890").masked).toBe("(123) 456-7890");
    expect(phone.apply("1a2b3").masked).toBe("(123");
    expect(phone.apply("1a2b3").raw).toBe("123");
  });

  it("letters, either, and a transformation", () => {
    const plate = new PatternMask("aa-0000", { transform: (char) => char.toUpperCase() });
    expect(plate.apply("hb1234").masked).toBe("HB-1234");
    expect(plate.apply("h1b").masked).toBe("HB");
    expect(new PatternMask("***-***").apply("a1b2c3").masked).toBe("a1b-2c3");
    expect(plate.numeric).toBe(false);
    expect(phone.numeric).toBe(true);
  });

  it("the value: masked, or the characters only with cleanDelimiters", () => {
    expect(phone.value("1234567890")).toBe("(123) 456-7890");
    expect(new PatternMask("(000) 000-0000", { cleanDelimiters: true }).value("(123) 456-7890")).toBe("1234567890");
  });

  it("shows the open places with the placeholder", () => {
    const masked = new PatternMask("(000) 000-0000", { placeholder: "_" });
    expect(masked.format("12")).toBe("(12_) ___-____");
    expect(masked.format("(12_) ___-____")).toBe("(12_) ___-____");
    expect(masked.format("")).toBe("");
  });

  it("puts the caret after the character it was after", () => {
    expect(phone.caret(0)).toBe(1);
    expect(phone.caret(1)).toBe(2);
    expect(phone.caret(3)).toBe(4);
    expect(phone.caret(4)).toBe(7);
    expect(phone.caret(10)).toBe(14);
  });

  it("takes a pattern as text", () => {
    expect(toMask("00")?.apply("123").masked).toBe("12");
    expect(toMask(undefined)).toBeUndefined();
    expect(toMask("")).toBeUndefined();
  });
});

describe("maskInput", () => {
  it("writes the field again as someone types, the caret after the new character", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    input.value = "1234";
    input.setSelectionRange(4, 4);
    expect(maskInput(input, new PatternMask("(000) 000-0000"))).toBe("(123) 4");
    expect(input.value).toBe("(123) 4");
    expect(input.selectionStart).toBe(7);
    // Typing in the middle: "(12|3) 4" + "9".
    input.value = "(129|3) 4".replace("|", "");
    input.setSelectionRange(4, 4);
    maskInput(input, new PatternMask("(000) 000-0000"));
    expect(input.value).toBe("(129) 34");
    expect(input.selectionStart).toBe(4);
    input.remove();
  });
});

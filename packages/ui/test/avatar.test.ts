import { describe, expect, it } from "vitest";
import { AVATAR_COLORS } from "../src/index";
import { avatarColorFor, avatarIconSize, avatarInitials } from "../src/kit";

describe("avatarInitials (Fluent UI's getInitials)", () => {
  it("takes the first and the last word's first letters", () => {
    expect(avatarInitials("Ada Lovelace")).toBe("AL");
    expect(avatarInitials("ada byron lovelace")).toBe("AL");
    expect(avatarInitials("Ada")).toBe("A");
    expect(avatarInitials("  Ada   Lovelace  ")).toBe("AL");
  });

  it("drops text in brackets and symbols", () => {
    expect(avatarInitials("Ada Lovelace (Admin)")).toBe("AL");
    expect(avatarInitials("[Bot] Helper")).toBe("H");
    expect(avatarInitials("Émile Zola")).toBe("ÉZ");
  });

  it("has none for a phone number, a script without Latin initials, or nothing", () => {
    expect(avatarInitials("+49 40 123456")).toBe("");
    expect(avatarInitials("田中 太郎")).toBe("");
    expect(avatarInitials("")).toBe("");
    expect(avatarInitials(undefined)).toBe("");
  });

  it("reverses them right to left", () => {
    expect(avatarInitials("Ada Lovelace", true)).toBe("LA");
  });
});

describe("avatarColorFor", () => {
  it("colorful picks a named color by the name, the same one every time", () => {
    const color = avatarColorFor("colorful", "Ada Lovelace");
    expect(AVATAR_COLORS).toContain(color);
    expect(avatarColorFor("colorful", "Ada Lovelace")).toBe(color);
    expect(new Set(["Ada", "Bo", "Cy", "Dee", "Eve", "Fay", "Gus"].map((name) => avatarColorFor("colorful", name))).size).toBeGreaterThan(1);
    expect(avatarColorFor("colorful", "Ada Lovelace", "user-7")).toBe(avatarColorFor("colorful", "someone else", "user-7"));
  });

  it("keeps any other color", () => {
    expect(avatarColorFor("brand", "Ada")).toBe("brand");
    expect(avatarColorFor("teal", "Ada")).toBe("teal");
  });
});

describe("avatarIconSize", () => {
  it("follows Fluent UI React's table", () => {
    expect([16, 24, 32, 48, 64, 96].map(avatarIconSize)).toEqual([12, 16, 20, 24, 32, 48]);
  });
});

import { describe, expect, it } from "vitest";
import { Guid } from "../src/index.js";

describe("Guid", () => {
  it("newGuid produces a valid lowercase D form", () => {
    expect(Guid.newGuid().value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("parses the textual forms to the D form", () => {
    const empty = "00000000-0000-0000-0000-000000000000";
    expect(Guid.parse(`{${empty.toUpperCase()}}`)!.value).toBe(empty);
    expect(Guid.parse(empty.replace(/-/g, ""))!.value).toBe(empty);
    expect(Guid.parse(`(${empty})`)!.value).toBe(empty);
    expect(Guid.parse("not-a-guid")).toBeNull();
  });

  it("empty is the all-zero GUID and equality is case-insensitive", () => {
    expect(Guid.empty.value).toBe("00000000-0000-0000-0000-000000000000");
    expect(Guid.parse("00000000-0000-0000-0000-000000000000")!.equals(Guid.empty)).toBe(true);
  });

  it("throws on an invalid constructor argument, serializes as a string", () => {
    expect(() => new Guid("x")).toThrow(/GUID/);
    const id = Guid.newGuid();
    expect(JSON.stringify({ id })).toBe(`{"id":"${id.value}"}`);
  });
});

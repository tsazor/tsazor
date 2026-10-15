/**
 * `Guid` — a UUID, .NET's `System.Guid`. `crypto.randomUUID()` is the platform
 * primitive (`Guid.newGuid()`); `parse` accepts the common textual forms
 * (the `D` `xxxxxxxx-…` form, `N` without dashes, `B` with braces, `P` with
 * parens) and normalizes to the lowercase `D` form. The string is the wire
 * format (`toJSON`); `@tsazor/dotnet` maps OpenAPI `format: uuid` to it.
 */

/** Normalizes a textual GUID to the lowercase `D` form; null when it is not one. */
function normalizeGuid(text: string): string | null {
  let hex = text.trim();
  if ((hex.startsWith("{") && hex.endsWith("}")) || (hex.startsWith("(") && hex.endsWith(")"))) {
    hex = hex.slice(1, -1);
  }
  hex = hex.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  return hex.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

export class Guid {
  /** The all-zero GUID, .NET's `Guid.Empty`. */
  static readonly empty: Guid = new Guid("00000000-0000-0000-0000-000000000000");

  /** The canonical lowercase `D` form (`xxxxxxxx-xxxx-…`). */
  readonly value: string;

  /** `new Guid("00000000-…")` — validates and normalizes; throws on anything that is not a GUID (use `parse` for the lenient form). */
  constructor(value: string) {
    const normalized = normalizeGuid(value);
    if (normalized === null) throw new RangeError(`Guid: not a GUID: ${JSON.stringify(value)}`);
    this.value = normalized;
  }

  /** A new random GUID (crypto.randomUUID). */
  static newGuid(): Guid {
    return new Guid(crypto.randomUUID());
  }

  /** Parses a GUID in any textual form; null on anything else. */
  static parse(text: string): Guid | null {
    const normalized = normalizeGuid(text);
    return normalized === null ? null : new Guid(normalized);
  }

  equals(other: Guid): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}

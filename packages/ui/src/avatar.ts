/**
 * An avatar's text and color, as Fluent UI's Avatar computes them (`getInitials`, the `colorful` hash), shared by both
 * skins.
 */

/** Fluent 2's avatar colors, in Fluent UI React's order (`avatarColors`): `colorful` picks one by the name's hash. */
export const AVATAR_COLORS = [
  "dark-red", "cranberry", "red", "pumpkin", "peach", "marigold", "gold", "brass", "brown", "forest", "seafoam",
  "dark-green", "light-teal", "teal", "steel", "blue", "royal-blue", "cornflower", "navy", "lavender", "purple", "grape",
  "lilac", "pink", "magenta", "plum", "beige", "mink", "platinum", "anchor",
] as const;

/** A named avatar color. */
export type AvatarNamedColor = (typeof AVATAR_COLORS)[number];

/** An avatar's color (Fluent UI Blazor's AvatarColor): gray, the brand's, one picked by the name, or a named one. */
export type AvatarColor = "neutral" | "brand" | "colorful" | AvatarNamedColor;

/** Text in brackets, characters that aren't part of a name, and runs of spaces (Fluent UI's cleanupDisplayName). */
const BRACKETS = /[\(\[\{<][^\)\]\}>]*[\)\]\}>]/g;
const UNWANTED = /[\0-\u001F!-/:-@[-`{-¿ɐ-ͯ\uD800-￿]/g;
const SPACES = /\s+/g;
/** Scripts whose names have no initials in the Latin sense (Arabic, Hangul, kana, CJK). */
const UNSUPPORTED = /[؀-ۿݐ-ݿࢠ-ࣿᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿]|[\uD840-\uD869][\uDC00-\uDED6]/;
const PHONE = /^\d+[\d\s]*(:?ext|x|)\s*\d+$/i;

/**
 * The initials of a name, as Fluent UI shows them: the first letters of the first and the last word ("Ada Lovelace" →
 * "AL", "ada" → "A"), without text in brackets ("Ada (Admin)") or symbols. A phone number, or a name in a script
 * without Latin initials, has none: the avatar shows its icon then.
 */
export function avatarInitials(name: string | null | undefined, rtl = false): string {
  if (!name) return "";
  const clean = name.replace(BRACKETS, "").replace(UNWANTED, "").replace(SPACES, " ").trim();
  if (clean === "" || UNSUPPORTED.test(clean) || PHONE.test(clean)) return "";
  const words = clean.split(" ");
  const first = [...(words[0] ?? "")][0] ?? "";
  const last = words.length > 1 ? ([...(words[words.length - 1] ?? "")][0] ?? "") : "";
  const initials = rtl && last !== "" ? last + first : first + last;
  return initials.toUpperCase();
}

/** Fluent UI's hash for `colorful` (getHashCode): the same name always gets the same color. */
function hashOf(text: string): number {
  let hash = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const code = text.charCodeAt(i);
    const shift = i % 8;
    hash ^= (code << shift) + (code >> (8 - shift));
  }
  return hash;
}

/** The named color an avatar shows: `colorful` becomes one of AVATAR_COLORS by the name (or `key`); others stay. */
export function avatarColorFor(color: AvatarColor, name: string | null | undefined, key?: string): AvatarColor {
  if (color !== "colorful") return color;
  const index = Math.abs(hashOf(key ?? name ?? "")) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] ?? "neutral";
}

/** Fluent UI React's icon size for an avatar size (a 32px avatar shows a 20px icon). */
export function avatarIconSize(size: number): number {
  if (size <= 20) return 12;
  if (size <= 28) return 16;
  if (size <= 40) return 20;
  if (size <= 48) return 24;
  if (size <= 56) return 28;
  if (size <= 72) return 32;
  return 48;
}

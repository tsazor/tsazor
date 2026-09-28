/**
 * HTML entity decoding for markup text and static attribute values.
 * Razor decodes entities while parsing markup; the Tasor DOM renderer writes
 * text with createTextNode (no HTML parsing), so entities must be decoded at
 * compile time — `&amp;` must render as "&", not literally.
 */

/** Common named entities (HTML5 subset: basic five + frequently used). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  middot: "·",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  bull: "•",
  dagger: "†",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  ne: "≠",
  le: "≤",
  ge: "≥",
  // German-language standbys
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
};

/** Code points that String.fromCodePoint accepts but HTML treats as invalid. */
function isUsableCodePoint(cp: number): boolean {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF);
}

/**
 * Decodes HTML character references: numeric (`&#8212;`, `&#x2014;`) and the
 * common named set. Unknown entities stay literal, matching HTML parsing.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9A-Fa-f]+|#X[0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[1] === "x" || body[1] === "X") {
      const cp = parseInt(body.slice(2), 16);
      return isUsableCodePoint(cp) ? String.fromCodePoint(cp) : whole;
    }
    if (body.startsWith("#")) {
      const cp = parseInt(body.slice(1), 10);
      return isUsableCodePoint(cp) ? String.fromCodePoint(cp) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}
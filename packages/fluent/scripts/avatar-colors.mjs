/**
 * Writes src/styles/avatar-colors.css: Fluent 2's avatar colors (the persona palette, red, marigold and the neutral
 * avatar) from @fluentui/tokens (MIT, Microsoft), which is not a dependency:
 *
 *   npm pack @fluentui/tokens@1.0.0-alpha.22 && tar -xzf fluentui-tokens-*.tgz
 *   node scripts/avatar-colors.mjs package/lib src/styles/avatar-colors.css
 */
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
const [lib, out] = process.argv.slice(2);
const light = (await import(pathToFileURL(`${lib}/alias/lightColorPalette.js`).href)).colorPaletteTokens;
const dark = (await import(pathToFileURL(`${lib}/alias/darkColorPalette.js`).href)).colorPaletteTokens;
// Fluent UI React's Avatar color order (avatarColors): `colorful` picks from it by a hash of the name.
const COLORS = ["darkRed", "cranberry", "red", "pumpkin", "peach", "marigold", "gold", "brass", "brown", "forest", "seafoam", "darkGreen", "lightTeal", "teal", "steel", "blue", "royalBlue", "cornflower", "navy", "lavender", "purple", "grape", "lilac", "pink", "magenta", "plum", "beige", "mink", "platinum", "anchor"];
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
// Fluent's neutral avatar: colorNeutralBackground6 and colorNeutralForeground3 (light / dark).
const NEUTRAL = { light: ["#e6e6e6", "#616161"], dark: ["#333333", "#adadad"] };
const neutral = (theme, indent) => `${indent}--fui-avatar-neutral-background: ${NEUTRAL[theme][0]};
${indent}--fui-avatar-neutral-foreground: ${NEUTRAL[theme][1]};
`;
const block = (tokens, indent) => COLORS.flatMap((name) => {
  const key = name[0].toUpperCase() + name.slice(1);
  const values = [["background", tokens[`colorPalette${key}Background2`]], ["foreground", tokens[`colorPalette${key}Foreground2`]], ["border", tokens[`colorPalette${key}BorderActive`]]];
  for (const [part, value] of values) if (!value) throw new Error(`${name} ${part}`);
  return values.map(([part, value]) => `${indent}--fui-avatar-${kebab(name)}-${part}: ${value};`);
}).join("\n");
const css = `/* Avatar colors — Fluent 2's persona palette (Background2, Foreground2, BorderActive) and its neutral avatar, light and dark, written from
 * @fluentui/tokens 1.0.0-alpha.22 (MIT, Microsoft). Avatar's color="dark-red" … color="colorful" read them. */

:root,
[data-fluent-theme="light"] {
${neutral("light", "  ")}${block(light, "  ")}
}

[data-fluent-theme="dark"] {
${neutral("dark", "  ")}${block(dark, "  ")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-fluent-theme]),
  :root[data-fluent-theme="system"] {
${neutral("dark", "    ")}${block(dark, "    ")}
  }
}
`;
writeFileSync(out, css);
console.log(`${COLORS.length} avatar colors`);

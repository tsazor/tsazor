// create-tenant-dialog.tsx's framework-free helpers, unchanged.

/** The tenant identifier: lowercase letters, digits, hyphens; 3–64 chars; no leading/trailing hyphen. */
export const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** Derive a URL-safe slug from free text. Trailing/leading hyphens trimmed; capped to 64. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Strong random password from a copy-friendly charset (no ambiguous 0/O/1/l/I). */
export function generatePassword(length = 16): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*?";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += charset[bytes[i]! % charset.length];
  return out;
}

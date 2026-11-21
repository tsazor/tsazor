// pages/auth/reset-password.tsx's strength meter, unchanged: a score from length and character classes, and how
// each level draws (label, fill color, bar width).

export type Strength = "weak" | "fair" | "strong";

export function scorePassword(value: string): Strength | null {
  if (value.length === 0) return null;
  if (value.length < 8) return "weak";
  let score = 0;
  if (/[a-z]/.test(value)) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (value.length >= 12) score++;
  if (score <= 2) return "weak";
  if (score === 3) return "fair";
  return "strong";
}

export const STRENGTH_META: Record<Strength, { label: string; fill: string; bar: string }> = {
  weak: { label: "Weak", fill: "bg-[var(--color-destructive)]", bar: "w-1/3" },
  fair: { label: "Fair", fill: "bg-[var(--color-warning)]", bar: "w-2/3" },
  strong: { label: "Strong", fill: "bg-[var(--color-success)]", bar: "w-full" },
};

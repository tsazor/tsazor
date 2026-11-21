// components/list/tone-icon-tile.tsx's tones and sizes, for ToneIconTile and its callers.

export type ToneIconTileTone =
  | "primary"
  | "saffron"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted";

export type ToneIconTileSize = "sm" | "md" | "lg";

export const TONE_VAR: Record<ToneIconTileTone, string> = {
  primary:     "--color-primary",
  saffron:     "--color-saffron",
  success:     "--color-success",
  warning:     "--color-warning",
  destructive: "--color-destructive",
  info:        "--color-info",
  muted:       "--color-muted-foreground",
};

export const SIZE_MAP: Record<ToneIconTileSize, { tile: string; icon: string; radius: string }> = {
  sm: { tile: "size-7",  icon: "size-3.5", radius: "rounded-md" },
  md: { tile: "size-9",  icon: "size-4",   radius: "rounded-lg" },
  lg: { tile: "size-10", icon: "size-5",   radius: "rounded-xl" },
};

export type StatTone = "default" | "signal" | "success" | "warning" | "danger" | "info";

export const TONE_VALUE_CLASS: Record<StatTone, string> = {
  default: "text-[var(--color-foreground)]",
  signal: "text-[var(--color-accent-signal)]",
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-destructive)]",
  info: "text-[var(--color-info)]",
};

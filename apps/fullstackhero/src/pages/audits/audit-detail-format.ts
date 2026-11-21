// pages/audits/detail.tsx's helpers, for the detail sheet's parts. (The list formats differently: AuditRow.)

import type { BadgeVariant } from "@/components/ui/variants";

export function formatEventType(raw: unknown): string {
  return typeof raw === "string" && raw.length > 0 ? raw : "Event";
}

export function eventTypeVariant(eventType: string): "info" | "warning" | "danger" | "muted" {
  switch (eventType) {
    case "Exception":
      return "danger";
    case "Security":
      return "warning";
    case "EntityChange":
    case "Activity":
      return "info";
    default:
      return "muted";
  }
}

export function severityTone(s: string): { variant: Extract<BadgeVariant, "muted" | "info" | "warning" | "danger" | "default"> } {
  switch (s) {
    case "Critical":
    case "Error":
      return { variant: "danger" };
    case "Warning":
      return { variant: "warning" };
    case "Information":
      return { variant: "info" };
    case "Trace":
    case "Debug":
      return { variant: "muted" };
    default:
      return { variant: "default" };
  }
}

export function formatTimestamp(value: string | undefined | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

const TAG_NAMES: ReadonlyArray<{ bit: number; label: string }> = [
  { bit: 1 << 0, label: "PiiMasked" },
  { bit: 1 << 1, label: "OutOfQuota" },
  { bit: 1 << 2, label: "Sampled" },
  { bit: 1 << 3, label: "RetainedLong" },
  { bit: 1 << 4, label: "HealthCheck" },
  { bit: 1 << 5, label: "Authentication" },
  { bit: 1 << 6, label: "Authorization" },
];

/** renderTagsInline's set: the names of the flags in `tags` (ContextGrid renders them). */
export function tagNamesOf(tags: number): string[] {
  if (!tags || tags === 0) return [];
  return TAG_NAMES.filter((t) => (tags & t.bit) === t.bit).map((t) => t.label);
}

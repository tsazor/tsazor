// pages/health/page.tsx's status helpers.

import type { HealthStatus } from "@/api/health";

export function statusToTone(s: HealthStatus): "default" | "success" | "warning" | "danger" {
  if (s === "Healthy") return "success";
  if (s === "Degraded") return "warning";
  if (s === "Unknown") return "default";
  return "danger";
}

export function statusToColor(s: HealthStatus): string {
  if (s === "Healthy") return "bg-[var(--color-success)]";
  if (s === "Degraded") return "bg-[var(--color-warning)]";
  return "bg-[var(--color-destructive)]";
}

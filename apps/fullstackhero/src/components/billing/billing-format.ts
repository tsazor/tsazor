import type { InvoiceLineItemKind, InvoiceStatus } from "@/api/billing";
import type { TopupRequestStatus } from "@/api/wallet";
import type { BadgeVariant } from "@/components/ui/variants";
import { ApiRequestError } from "@/lib/api-client";

// The billing pages' helpers — each of the original's pages (plans-list.tsx, invoices-list.tsx, invoice-detail.tsx,
// topups-list.tsx, plan-form-dialog.tsx) declares its own copies at module level; they are framework-free and live
// here once.

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const dateShort = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const dateLong = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** The lists' date ("May 01, 2026"). */
export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateShort.format(d);
}

/** The invoice detail's date ("May 1, 2026"). */
export function formatDateLong(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateLong.format(d);
}

export function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function invoiceStatusVariant(status: InvoiceStatus): BadgeVariant {
  switch (status) {
    case "Paid":
      return "success";
    case "Issued":
      return "info";
    case "Draft":
      return "warning";
    case "Void":
      return "danger";
    default:
      return "default";
  }
}

export function topupStatusVariant(status: TopupRequestStatus): BadgeVariant {
  switch (status) {
    case "Completed":
      return "success";
    case "Approved":
      return "info";
    case "Pending":
      return "warning";
    case "Rejected":
      return "danger";
    default:
      return "default";
  }
}

export function lineItemKindVariant(kind: InvoiceLineItemKind): BadgeVariant {
  return kind === "BaseFee" ? "default" : kind === "Overage" ? "warning" : "muted";
}

export function describe(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) return err.problem?.detail ?? err.problem?.title ?? err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

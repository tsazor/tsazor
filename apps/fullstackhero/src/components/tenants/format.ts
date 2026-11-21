import { ApiRequestError } from "@/lib/api-client";

// The tenants area's formatting helpers. The original repeats them per file (pages/tenants/*.tsx,
// components/tenants/*.tsx); the port's components share these.

/** A date as the browser's locale writes it; "—" without one, the text itself when it isn't a date. */
export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

/** An amount in its currency, in the browser's locale. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** An error's text for a toast or an error band: the problem's detail or title, else the message. */
export function describe(err: unknown, fallback?: string): string {
  if (err instanceof ApiRequestError) return err.problem?.detail ?? err.problem?.title ?? err.message;
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}

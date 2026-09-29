/**
 * Pure formatting helpers for the ticker UI — no DOM, no imports, so
 * `node --test test/` can exercise them directly (Node 20, plain ESM).
 */

const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/** Compact 24h-volume form (e.g. 1.8B). */
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatUsd(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? usd.format(value)
        : "—";
}

/** $ in full precision for the big price; volumes get the compact form. */
export function formatCompact(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? compact.format(value)
        : "—";
}

export function formatPct(pct) {
    if (typeof pct !== "number" || !Number.isFinite(pct)) return "—";
    const sign = pct > 0 ? "+" : "";
    return `${sign}${pct.toFixed(2)} %`;
}

/** Bootstrap color variant for a change value. */
export function changeVariant(pct) {
    if (pct > 0) return "success";
    if (pct < 0) return "danger";
    return "secondary";
}

/** Short wall-clock label (HH:MM:SS) for an epoch-ms timestamp. */
export function timeLabel(ms) {
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toTimeString().slice(0, 8);
}

/** Appends to a bounded history (ring buffer semantics), returning a new array. */
export function pushCapped(items, item, cap) {
    const next = [...items, item];
    return next.length > cap ? next.slice(next.length - cap) : next;
}
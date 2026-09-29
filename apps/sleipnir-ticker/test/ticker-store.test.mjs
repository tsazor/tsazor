/**
 * Unit tests for the pure formatting/state helpers consumed by TickerStore.
 * Plain Node ESM, no browser, no transpile (Node 20).
 * Run: node --test test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUsd, formatPct, changeVariant, timeLabel, pushCapped } from "../src/formatters.mjs";

test("formatUsd renders $ with 2 decimals and thousands separator", () => {
    assert.equal(formatUsd(79_595.37), "$79,595.37");
    assert.equal(formatUsd(1_000_000), "$1,000,000.00");
});

test("formatUsd returns an em-dash for null/zero/negative", () => {
    assert.equal(formatUsd(null), "—");
    assert.equal(formatUsd(0), "—");
    assert.equal(formatUsd(-5), "—");
    assert.equal(formatUsd(undefined), "—");
});

test("formatPct signs positive changes and keeps negatives", () => {
    assert.equal(formatPct(1.234), "+1.23 %");
    assert.equal(formatPct(-1.5), "-1.50 %");
    assert.equal(formatPct(null), "—");
    assert.equal(formatPct(0), "0.00 %");
});

test("changeVariant maps the sign to Bootstrap colors", () => {
    assert.equal(changeVariant(0.1), "success");
    assert.equal(changeVariant(-0.1), "danger");
    assert.equal(changeVariant(0), "secondary");
    assert.equal(changeVariant(undefined), "secondary");
});

test("timeLabel formats a wall-clock HH:MM:SS label", () => {
    const stamp = new Date().getTime();
    assert.equal(timeLabel(stamp), new Date().toTimeString().slice(0, 8));
    assert.equal(timeLabel(NaN), "—");
});

test("pushCapped appends and trims the head of the ring", () => {
    const base = Array.from({ length: 5 }, (_, i) => ({ t: i, price: i }));
    const next = pushCapped(base, { t: 5, price: 50 }, 5);
    assert.equal(next.length, 5);
    assert.equal(next[0].t, 1);
    assert.equal(next[4].t, 5);
    // input untouched
    assert.equal(base.length, 5);
    assert.equal(base[0].t, 0);
});
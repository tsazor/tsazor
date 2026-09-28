/**
 * Unit tests for the status engine (port of OrderWithStatus.cs).
 * Run: node --test test/
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  orderWithStatus,
  computeStartPosition,
  interpolate,
  PREPARATION_DURATION_MS,
  DELIVERY_DURATION_MS,
} from "../server/server.mjs";

const LOCATION = { latitude: 51.5001, longitude: -0.1239 };
const baseOrder = { orderId: 1, deliveryLocation: LOCATION, deliveryAddress: { line1: "Baker Street" } };

test("a fresh order is Preparing with only the 'You' marker", () => {
  const ows = orderWithStatus({ ...baseOrder, createdTime: Date.now() });
  assert.equal(ows.statusText, "Preparing");
  assert.equal(ows.mapMarkers.length, 1);
  assert.equal(ows.mapMarkers[0].description, "You");
  assert.equal(ows.mapMarkers[0].showPopup, true);
});

test("after the preparation window the order is Out for delivery with a driver marker", () => {
  const ows = orderWithStatus({ ...baseOrder, createdTime: Date.now() - PREPARATION_DURATION_MS - 30_000 });
  assert.equal(ows.statusText, "Out for delivery");
  assert.equal(ows.mapMarkers.length, 2);
  assert.deepEqual(ows.mapMarkers.map((m) => m.description).sort(), ["Driver", "You"]);
  // The driver started away from the destination and is interpolated towards it.
  const driver = ows.mapMarkers.find((m) => m.description === "Driver");
  assert.notEqual(driver.x, LOCATION.longitude);
});

test("after the delivery window the order is Delivered with a single marker", () => {
  const ows = orderWithStatus({
    ...baseOrder,
    createdTime: Date.now() - PREPARATION_DURATION_MS - DELIVERY_DURATION_MS - 1000,
  });
  assert.equal(ows.statusText, "Delivered");
  assert.equal(ows.mapMarkers.length, 1);
  assert.equal(ows.mapMarkers[0].description, "Delivery location");
  assert.deepEqual(
    { x: ows.mapMarkers[0].x, y: ows.mapMarkers[0].y },
    { x: LOCATION.longitude, y: LOCATION.latitude },
  );
});

test("driver start position is deterministic per orderId", () => {
  const order = { ...baseOrder, createdTime: Date.now() - PREPARATION_DURATION_MS - 30_000 };
  const a = computeStartPosition(order);
  const b = computeStartPosition(order);
  assert.deepEqual(a, b);
  const other = computeStartPosition({ ...order, orderId: 999 });
  assert.notDeepEqual(a, other);
});

test("interpolate walks the straight line between two points", () => {
  const start = { latitude: 10, longitude: 20 };
  const end = { latitude: 20, longitude: 40 };
  assert.deepEqual(interpolate(start, end, 0), start);
  assert.deepEqual(interpolate(start, end, 1), end);
  assert.deepEqual(interpolate(start, end, 0.5), { latitude: 15, longitude: 30 });
});
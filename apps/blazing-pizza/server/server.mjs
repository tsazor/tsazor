/**
 * Blazing Pizza backend — a dependency-free re-implementation of the
 * workshop's ASP.NET Core server (BlazingPizza.Server) against the same
 * REST contract, so the Tsazor client can be ported 1:1.
 *
 * Deviations from the original (documented in docs/port-findings.md):
 *  - node:http instead of ASP.NET Core; in-memory store instead of EF/SQLite.
 *  - Cookie-session auth (POST /auth/login|register|logout, GET /auth/user)
 *    instead of ASP.NET Identity + OIDC.
 *  - No push notifications (the PUT /notifications/subscribe contract is
 *    honored but the subscription is only persisted in memory).
 *
 * Run: node server/server.mjs  (listens on :5300, vite proxies into it).
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = 5300;

/* ---------------------------------------------------------------------- */
/* Seed data (port of BlazingPizza.Server/SeedData.cs)                     */
/* ---------------------------------------------------------------------- */

const SPECIALS = [
  { id: 1, name: "Basic Cheese Pizza", description: "It's cheesy and delicious. Why wouldn't you want one?", basePrice: 9.99, imageUrl: "img/pizzas/cheese.jpg" },
  { id: 2, name: "The Baconatorizor", description: "It has EVERY kind of bacon", basePrice: 11.99, imageUrl: "img/pizzas/bacon.jpg" },
  { id: 3, name: "Classic pepperoni", description: "It's the pizza you grew up with, but Blazing hot!", basePrice: 10.5, imageUrl: "img/pizzas/pepperoni.jpg" },
  { id: 4, name: "Buffalo chicken", description: "Spicy chicken, hot sauce and bleu cheese, guaranteed to warm you up", basePrice: 12.75, imageUrl: "img/pizzas/meaty.jpg" },
  { id: 5, name: "Mushroom Lovers", description: "It has mushrooms. Isn't that obvious?", basePrice: 11.0, imageUrl: "img/pizzas/mushroom.jpg" },
  { id: 6, name: "The Brit", description: "When in London...", basePrice: 10.25, imageUrl: "img/pizzas/brit.jpg" },
  { id: 7, name: "Veggie Delight", description: "It's like salad, but on a pizza", basePrice: 11.5, imageUrl: "img/pizzas/salad.jpg" },
  { id: 8, name: "Margherita", description: "Traditional Italian pizza with tomatoes and basil", basePrice: 9.99, imageUrl: "img/pizzas/margherita.jpg" },
];

const TOPPINGS = [
  { id: 1, name: "Extra cheese", price: 2.5 },
  { id: 2, name: "American bacon", price: 2.99 },
  { id: 3, name: "British bacon", price: 2.99 },
  { id: 4, name: "Canadian bacon", price: 2.99 },
  { id: 5, name: "Tea and crumpets", price: 5.0 },
  { id: 6, name: "Fresh-baked scones", price: 4.5 },
  { id: 7, name: "Bell peppers", price: 1.0 },
  { id: 8, name: "Onions", price: 1.0 },
  { id: 9, name: "Mushrooms", price: 1.0 },
  { id: 10, name: "Pepperoni", price: 1.0 },
  { id: 11, name: "Duck sausage", price: 3.2 },
  { id: 12, name: "Venison meatballs", price: 2.5 },
  { id: 13, name: "Served on a silver platter", price: 250.99 },
  { id: 14, name: "Lobster on top", price: 64.5 },
  { id: 15, name: "Sturgeon caviar", price: 101.75 },
  { id: 16, name: "Artichoke hearts", price: 3.4 },
  { id: 17, name: "Fresh tomatoes", price: 1.5 },
  { id: 18, name: "Basil", price: 1.5 },
  { id: 19, name: "Steak (medium-rare)", price: 8.5 },
  { id: 20, name: "Blazing hot peppers", price: 4.2 },
  { id: 21, name: "Buffalo chicken", price: 5.0 },
  { id: 22, name: "Blue cheese", price: 2.5 },
];

/* ---------------------------------------------------------------------- */
/* Store (in-memory; the original used EF + SQLite)                        */
/* ---------------------------------------------------------------------- */

const users = new Map(); // userId -> { userId, name, email, password }
const orders = new Map(); // orderId -> stored order (with userId)
const subscriptions = new Map(); // userId -> subscription
let nextOrderId = 1;

const SPECIAL_BY_ID = new Map(SPECIALS.map((s) => [s.id, s]));
const TOPPING_BY_ID = new Map(TOPPINGS.map((t) => [t.id, t]));

/** Seed user: test@example.com / test1234 (shown on the login page). */
const seedUser = { userId: "test-user", name: "Test User", email: "test@example.com", password: "test1234" };
users.set(seedUser.email, seedUser);

/* ---------------------------------------------------------------------- */
/* Status engine (port of BlazingPizza.Shared/OrderWithStatus.cs)          */
/* ---------------------------------------------------------------------- */

const PREPARATION_DURATION_MS = 10_000;
const DELIVERY_DURATION_MS = 60_000; // Unrealistic, but more interesting to watch

/** Deterministic pseudo-random start position for the driver (Random(orderId)). */
function seededRandom(seed) {
  let state = seed | 0 || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function computeStartPosition(order) {
  const rng = seededRandom(order.orderId);
  const distance = 0.01 + rng() * 0.02;
  const angle = rng() * Math.PI * 2;
  return {
    latitude: order.deliveryLocation.latitude + distance * Math.cos(angle),
    longitude: order.deliveryLocation.longitude + distance * Math.sin(angle),
  };
}

function interpolate(start, end, proportion) {
  // The Earth is flat, right? So no need for spherical interpolation.
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * proportion,
    longitude: start.longitude + (end.longitude - start.longitude) * proportion,
  };
}

function toMapMarker(description, coords, showPopup = false) {
  return { description, x: coords.longitude, y: coords.latitude, showPopup };
}

function orderWithStatus(order) {
  const dispatchTime = new Date(order.createdTime).getTime() + PREPARATION_DURATION_MS;
  const now = Date.now();
  let statusText;
  let mapMarkers;

  if (now < dispatchTime) {
    statusText = "Preparing";
    mapMarkers = [toMapMarker("You", order.deliveryLocation, true)];
  } else if (now < dispatchTime + DELIVERY_DURATION_MS) {
    statusText = "Out for delivery";
    const startPosition = computeStartPosition(order);
    const proportion = Math.min(1, (now - dispatchTime) / DELIVERY_DURATION_MS);
    const driverPosition = interpolate(startPosition, order.deliveryLocation, proportion);
    mapMarkers = [toMapMarker("You", order.deliveryLocation), toMapMarker("Driver", driverPosition, true)];
  } else {
    statusText = "Delivered";
    mapMarkers = [toMapMarker("Delivery location", order.deliveryLocation, true)];
  }

  return { order, statusText, mapMarkers };
}

const isDelivered = (ows) => ows.statusText === "Delivered";

/* ---------------------------------------------------------------------- */
/* Auth (cookie sessions — the documented deviation)                       */
/* ---------------------------------------------------------------------- */

const SESSION_COOKIE = "tsazor_session";
const sessions = new Map(); // token -> userId

function parseCookies(req) {
  const header = req.headers.cookie ?? "";
  const cookies = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function currentUserId(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  return token ? sessions.get(token) ?? null : null;
}

function startSession(res, userId) {
  const token = randomUUID();
  sessions.set(token, userId);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`);
}

function endSession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
}

function publicUser(user) {
  return { userId: user.userId, name: user.name, email: user.email };
}

/* ---------------------------------------------------------------------- */
/* HTTP plumbing                                                           */
/* ---------------------------------------------------------------------- */

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/* ---------------------------------------------------------------------- */
/* Routing                                                                 */
/* ---------------------------------------------------------------------- */

async function route(req, res, url) {
  const method = req.method ?? "GET";
  const path = url.pathname;

  // CORS preflight (only needed for direct calls without the vite proxy).
  if (method === "OPTIONS") return sendJson(res, 204, null);

  /* --- Public: specials & toppings (PizzaApiExtensions.cs) --- */
  if (method === "GET" && path === "/specials") return sendJson(res, 200, SPECIALS);
  if (method === "GET" && path === "/toppings") {
    return sendJson(res, 200, [...TOPPINGS].sort((a, b) => a.name.localeCompare(b.name)));
  }

  /* --- Auth --- */
  if (method === "POST" && path === "/auth/register") {
    const { name, email, password } = await readBody(req);
    const normalized = String(email ?? "").trim().toLowerCase();
    if (!normalized || !password) return sendJson(res, 400, { error: "Email and password are required." });
    if (password.length < 6) return sendJson(res, 400, { error: "Password must be at least 6 characters." });
    if (users.has(normalized)) return sendJson(res, 400, { error: "That email is already registered." });
    const user = { userId: `user-${randomUUID().slice(0, 8)}`, name: String(name ?? "").trim() || normalized.split("@")[0], email: normalized, password: String(password) };
    users.set(normalized, user);
    startSession(res, user.userId);
    return sendJson(res, 200, publicUser(user));
  }
  if (method === "POST" && path === "/auth/login") {
    const { email, password } = await readBody(req);
    const normalized = String(email ?? "").trim().toLowerCase();
    const user = users.get(normalized);
    if (!user || user.password !== password) return sendJson(res, 401, { error: "Invalid email or password." });
    startSession(res, user.userId);
    return sendJson(res, 200, publicUser(user));
  }
  if (method === "POST" && path === "/auth/logout") {
    endSession(req, res);
    return sendJson(res, 200, { ok: true });
  }
  if (method === "GET" && path === "/auth/user") {
    // 200 with { user: null } when anonymous — keeps the browser console free
    // of failed-resource noise on app start (Blazor's RemoteAuthenticator
    // contract is also a plain JSON user shape).
    const userId = currentUserId(req);
    if (!userId) return sendJson(res, 200, { user: null });
    const user = [...users.values()].find((u) => u.userId === userId);
    return user ? sendJson(res, 200, { user: publicUser(user) }) : sendJson(res, 200, { user: null });
  }

  /* --- Everything below requires a session (OrdersController: [Authorize]) --- */
  const userId = currentUserId(req);
  const authorize = () => (userId ? null : (sendJson(res, 401, { error: "Not signed in." }), true));

  if (method === "GET" && path === "/orders") {
    if (authorize()) return;
    const mine = [...orders.values()].filter((o) => o.userId === userId).sort((a, b) => b.createdTime - a.createdTime);
    return sendJson(res, 200, mine.map(orderWithStatus));
  }
  const orderMatch = path.match(/^\/orders\/(\d+)$/);
  if (method === "GET" && orderMatch) {
    if (authorize()) return;
    const order = orders.get(Number(orderMatch[1]));
    if (!order || order.userId !== userId) return sendJson(res, 404, { error: "Not found." });
    return sendJson(res, 200, orderWithStatus(order));
  }
  if (method === "POST" && path === "/orders") {
    if (authorize()) return;
    const order = await readBody(req);
    // Enforce existence of SpecialId / ToppingId in the database — prevent
    // the submitter from making up new specials and toppings (original).
    const pizzas = (order.pizzas ?? []).map((pizza) => {
      const special = SPECIAL_BY_ID.get(pizza.specialId ?? pizza.special?.id);
      if (!special) throw new Error("Unknown special");
      return {
        specialId: special.id,
        special,
        size: Number(pizza.size) || 12,
        toppings: (pizza.toppings ?? []).map((pt) => {
          const topping = TOPPING_BY_ID.get(pt.toppingId ?? pt.topping?.id);
          if (!topping) throw new Error("Unknown topping");
          return { topping, toppingId: topping.id };
        }),
      };
    });
    const orderId = nextOrderId++;
    orders.set(orderId, {
      orderId,
      userId,
      createdTime: Date.now(),
      deliveryAddress: order.deliveryAddress ?? {},
      deliveryLocation: { latitude: 51.5001, longitude: -0.1239 },
      pizzas,
    });
    return sendJson(res, 200, orderId);
  }
  if (method === "PUT" && path === "/notifications/subscribe") {
    if (authorize()) return;
    const subscription = await readBody(req);
    subscriptions.delete(userId); // at most one subscription per user
    subscriptions.set(userId, subscription);
    return sendJson(res, 200, subscription);
  }
  if (method === "GET" && path === "/notifications") {
    if (authorize()) return;
    return sendJson(res, 200, subscriptions.get(userId) ?? null);
  }

  sendJson(res, 404, { error: `No endpoint for ${method} ${path}` });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  route(req, res, url).catch((err) => {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  });
});

// Only listen when started directly (node server/server.mjs); tests import
// the status engine and must not bind the port.
const invokedDirectly = process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("server/server.mjs");
if (invokedDirectly) {
  server.listen(PORT, () => {
    console.log(`Blazing Pizza API listening on http://localhost:${PORT}`);
    console.log(`Seed user: test@example.com / test1234`);
  });
}

export { orderWithStatus, isDelivered, computeStartPosition, interpolate, PREPARATION_DURATION_MS, DELIVERY_DURATION_MS };
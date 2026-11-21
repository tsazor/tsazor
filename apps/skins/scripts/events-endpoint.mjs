/**
 * The demo's server events, GET /api/events (text/event-stream): a numbered reading of the oven's temperature every
 * 300 ms. Each connection ends after five events, so the browser reconnects — and, sending the last id it saw in the
 * Last-Event-ID header, it gets the stream from the next one on: nothing lost, nothing twice. The dev server mounts
 * it (vite.config.ts) and so does the gate's static server (scripts/verify.mjs).
 */

const PER_CONNECTION = 5;
const EVERY_MS = 300;

/** The oven's temperature at reading `id`, in °C: the same for the same id, so a resumed stream continues the curve. */
function celsius(id) {
  return Math.round(230 + 6 * Math.sin(id / 4) + 2 * Math.sin(id * 1.3));
}

/** Handles GET /api/events; anything else is left to the next handler (`false`). */
export function streamEvents(request, response) {
  if (request.method !== "GET" || !(request.url ?? "").startsWith("/api/events")) return false;
  const last = Number(request.headers["last-event-id"] ?? 0);
  let id = Number.isFinite(last) ? last : 0;
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  // Reconnect quickly (the browser's default is a few seconds).
  response.write("retry: 300\n\n");
  let sent = 0;
  const timer = setInterval(() => {
    id++;
    sent++;
    response.write(`id: ${id}\ndata: ${JSON.stringify({ id, celsius: celsius(id) })}\n\n`);
    if (sent === PER_CONNECTION) {
      clearInterval(timer);
      response.end();
    }
  }, EVERY_MS);
  request.on("close", () => clearInterval(timer));
  return true;
}

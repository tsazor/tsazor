/**
 * The demo's upload endpoint, POST /api/upload: it reads the multipart body and answers with its size — enough for
 * the FileUpload demo to send real requests with real progress. The dev server mounts it (vite.config.ts) and so does
 * the gate's static server (scripts/verify.mjs).
 */

/** Handles POST /api/upload; anything else is left to the next handler (`false`). */
export function receiveUpload(request, response) {
  if (request.method !== "POST" || !(request.url ?? "").startsWith("/api/upload")) return false;
  let received = 0;
  request.on("data", (chunk) => {
    received += chunk.length;
  });
  request.on("end", () => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ received }));
  });
  return true;
}

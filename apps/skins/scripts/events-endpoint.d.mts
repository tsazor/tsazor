import type { IncomingMessage, ServerResponse } from "node:http";

/** Handles GET /api/events; anything else is left to the next handler (`false`). */
export function streamEvents(request: IncomingMessage, response: ServerResponse): boolean;

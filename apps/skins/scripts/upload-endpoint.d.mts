import type { IncomingMessage, ServerResponse } from "node:http";

/** Handles POST /api/upload; anything else is left to the next handler (`false`). */
export function receiveUpload(request: IncomingMessage, response: ServerResponse): boolean;

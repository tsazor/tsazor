/**
 * Pure helpers for the jobs pages — no DOM, no imports, so `node --test test/` exercises them
 * directly (plain ESM).
 */

/**
 * The field errors of a failed Sleipnir call. Jobs.Start answers a validation failure with
 * code 400 (category InvalidArgument) and the map `{ field: [messages] }` as JSON in
 * `error.details`. Returns null for any other error (or a success).
 */
export function fieldErrorsOf(error) {
    if (!error || error.code !== 400 || typeof error.details !== "string") return null;
    let parsed;
    try {
        parsed = JSON.parse(error.details);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const errors = {};
    for (const [field, messages] of Object.entries(parsed)) {
        if (Array.isArray(messages)) errors[field] = messages.map(String);
    }
    return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Appends a sequenced event (`seq` 1, 2, 3, …) unless it was applied already — a replay after
 * a reconnect, or a second subscription, delivers the history again. Returns the same array
 * when the event is a duplicate, else a new one.
 */
export function appendSequenced(events, event) {
    const last = events.length > 0 ? events[events.length - 1].seq : 0;
    return event.seq > last ? [...events, event] : events;
}

/** Bootstrap color of a job state. */
export function jobVariant(state) {
    if (state === "done") return "success";
    if (state === "failed") return "danger";
    return "primary";
}

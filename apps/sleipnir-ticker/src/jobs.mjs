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

/** Bootstrap color of a job state. */
export function jobVariant(state) {
    if (state === "done") return "success";
    if (state === "failed") return "danger";
    return "primary";
}

/**
 * `role="alert"`-Zeilen nur bei Submit-Fehlern (4.2): Die Validierungszeile
 * eines Inputs erscheint erst, wenn das Formular einmal abgeschickt wurde —
 * vorher stört die lebende Feldvalidierung nur (Feldklassen bleiben live).
 *
 * Der Zustand hängt am EditContext (ein Kontext pro Formular-Leben); ein
 * WeakSet hält ihn ohne Referenz auf die Komponenten.
 */
import type { EditContext } from "@tsazor/runtime";

/** Die EditContexts, auf denen bereits ein Submit versucht wurde. */
const attempts = new WeakSet<EditContext>();

/** Merkt einen Submit-Versuch (gültiger wie ungültiger) einer FluentForm. */
export function markSubmitAttempt(context: EditContext): void {
  attempts.add(context);
}

/**
 * Gatter für die Meldzeilen: erst nach dem ersten Submit-Versuch zeigen
 * Inputs ihre Validierungsmeldungen (und tragen `role="alert"`).
 */
export function hasSubmitAttempt(context?: EditContext): boolean {
  return context !== undefined && attempts.has(context);
}
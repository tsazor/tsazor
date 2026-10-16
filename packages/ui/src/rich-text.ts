/**
 * The rich-text wrapper's contract for external engines (design-extended-library.md §2.7, D-X9):
 * an engine factory builds the editor on an element; the value goes in and out as HTML and the
 * engine's changes come out as its own events. The wrapper imports no engine: the factory is the
 * seam, so an app adds the engine it wants (RichText2's core speaks this shape natively —
 * `new RichTextEditorCore(element, config)`, `getHTML`, `setHTML`, `on("change", …)`
 * with `{ html: string }`, `destroy()`).
 *
 * This is the wrapper's deliberate dependency-free cut: the editor engine never becomes a
 * dependency of `@tsazor/ui` or of the skins; the app adds it to its own package.json.
 */

/** The editor an engine factory returns — the little face the wrapper talks to. */
export interface RichTextEditorContract {
  /** The editor's content as HTML (its DOM's serialized content). */
  getHTML(): string;
  /** Replaces the editor's content (an outside change to the bound value). */
  setHTML(html: string): void;
  /** Subscribes the engine's change events; the handler gets the new HTML. */
  on(event: "change", handler: (data: { html: string }) => void): void;
  /** Removes the editor's DOM and listeners (the wrapper calls it when the component goes away). */
  destroy(): void;
}

/** An engine factory: makes the editor on `element`, with whatever config the engine takes. */
export type RichTextFactory = (element: HTMLElement, config?: unknown) => RichTextEditorContract;
import type { Attachment } from "@tsazor/runtime";
import { isTopLayer, openLayer } from "../layers.js";

/** Why a layer asks to be dismissed. */
export type DismissReason = "escape" | "outside";

/** Options of `dismissible`. */
export interface DismissibleOptions {
  /**
   * The overlay this belongs to (`createLayer()`): a dialog's focus trap and its dismiss handling
   * share one, so they count as one layer. Default: a layer of its own.
   */
  layer?: object;
  /** Called when the user asks to close the layer; the component then closes it (or not). */
  onDismiss: (reason: DismissReason) => void;
  /** React to Escape. Default true. */
  escape?: boolean;
  /** React to a pointer press outside the element. Default true. */
  outside?: boolean;
  /**
   * Elements whose presses don't count as outside — typically the button
   * that opened the layer (it toggles it itself).
   */
  ignore?: () => ReadonlyArray<Element | null | undefined>;
}

/**
 * Asks to close a layer (dialog, menu, popover) on Escape or on a press
 * outside it. Only the topmost open layer reacts, so Escape closes a menu
 * before the dialog it sits in. The component decides: `onDismiss` usually
 * sets its `isOpen` to false or raises its `onClosed`.
 *
 * ```razor
 * <ul role="menu" @attach="dismiss">…</ul>
 *
 * @code {
 *   dismiss = dismissible({ onDismiss: () => this.close(), ignore: () => [this.toggle] });
 * }
 * ```
 */
export function dismissible(options: DismissibleOptions): Attachment<HTMLElement> {
  return (element) => {
    const document = element.ownerDocument;
    const layer = options.layer ?? {};
    const closeLayer = openLayer(layer);

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || options.escape === false || !isTopLayer(layer)) return;
      event.preventDefault();
      event.stopPropagation();
      options.onDismiss("escape");
    };
    const onPointerdown = (event: Event): void => {
      if (options.outside === false || !isTopLayer(layer)) return;
      const target = event.target as Node | null;
      if (target === null || element.contains(target)) return;
      if (options.ignore?.().some((ignored) => ignored != null && ignored.contains(target))) return;
      options.onDismiss("outside");
    };
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("pointerdown", onPointerdown, true);

    return () => {
      document.removeEventListener("keydown", onKeydown, true);
      document.removeEventListener("pointerdown", onPointerdown, true);
      closeLayer();
    };
  };
}

import type { Attachment } from "@tsazor/runtime";

let locks = 0;
let restore = "";

/**
 * Stops the page behind a modal layer from scrolling while the element is
 * in the page. Nested locks count: the page scrolls again when the last one
 * goes away.
 *
 * ```razor
 * <div class="backdrop" @attach="scrollLock()">…</div>
 * ```
 */
const lockScroll: Attachment<HTMLElement> = (element) => {
  const body = element.ownerDocument.body;
  if (locks++ === 0) {
    restore = body.style.overflow;
    body.style.overflow = "hidden";
  }
  return () => {
    if (--locks === 0) body.style.overflow = restore;
  };
};

/** The attachment that locks the page's scrolling while it is attached; the same one on every call, so a render keeps it. */
export function scrollLock(): Attachment<HTMLElement> {
  return lockScroll;
}

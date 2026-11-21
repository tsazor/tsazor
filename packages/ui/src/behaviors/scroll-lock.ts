import type { Attachment } from "@tsazor/runtime";

let locks = 0;
let restore = { overflow: "", paddingRight: "" };

/**
 * Stops the page behind a modal layer from scrolling while the element is
 * in the page. Nested locks count: the page scrolls again when the last one
 * goes away. Where the scrollbar takes room (Windows, Linux), its width goes
 * to the body's right padding meanwhile, so the page doesn't shift — as
 * Bootstrap's modal does.
 *
 * ```razor
 * <div class="backdrop" @attach="scrollLock()">…</div>
 * ```
 */
const lockScroll: Attachment<HTMLElement> = (element) => {
  const document = element.ownerDocument;
  const body = document.body;
  if (locks++ === 0) {
    restore = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const scrollbar = scrollbarWidth(document);
    if (scrollbar > 0) {
      const padding = Number.parseFloat(document.defaultView!.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${padding + scrollbar}px`;
    }
    body.style.overflow = "hidden";
  }
  return () => {
    if (--locks > 0) return;
    body.style.overflow = restore.overflow;
    body.style.paddingRight = restore.paddingRight;
  };
};

/** The width the page's vertical scrollbar takes; 0 for an overlay scrollbar, and in a DOM without layout. */
function scrollbarWidth(document: Document): number {
  const view = document.defaultView;
  const width = document.documentElement.clientWidth;
  if (view === null || width === 0) return 0;
  return Math.max(0, view.innerWidth - width);
}

/** The attachment that locks the page's scrolling while it is attached; the same one on every call, so a render keeps it. */
export function scrollLock(): Attachment<HTMLElement> {
  return lockScroll;
}

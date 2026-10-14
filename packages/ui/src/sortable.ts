/**
 * A sortable list's behavior (Fluent UI Blazor's FluentSortableList, MudBlazor's MudDropContainer): items dragged
 * with any pointer (mouse, pen, touch), within a list or to another list of the same group, and a keyboard way to do
 * the same — Space or Enter picks an item up, the arrow keys move it (along the list, and across to the lists before
 * and after it in its group), Space or Enter puts it down, Escape puts it back. The list is one tab stop; the arrow
 * keys move the focus while nothing is picked up. The component keeps the items; this behavior asks it to move them.
 */
import type { Attachment } from "@tsazor/runtime";
import type { Orientation } from "./vocabulary.js";
import { englishLibraryTexts, type LibraryTexts } from "./library-texts.js";
import { showInTopLayer } from "./behaviors/top-layer.js";

/** Where an item went (Fluent UI Blazor's `FluentSortableListEventArgs`). */
export class SortableListEventArgs {
  constructor(
    /** Its index before. */
    readonly oldIndex: number,
    /** Its index after. */
    readonly newIndex: number,
    /** The id of the list it came from. */
    readonly fromListId: string | undefined,
    /** The id of the list it went to. */
    readonly toListId: string | undefined,
  ) {}
}

/** The texts a sortable list says (English by default). */
export interface SortableListLabels {
  /** How to move an item with the keys (each item's description). */
  readonly instructions: string;
  readonly grabbed: (item: string, position: number, count: number) => string;
  readonly moved: (item: string, position: number, count: number) => string;
  readonly movedToList: (item: string, list: string, position: number, count: number) => string;
  readonly dropped: (item: string, position: number, count: number) => string;
  readonly canceled: (item: string) => string;
}

/** The default texts. */
/** The list's texts from the library texts (`tsazor.ui.sortableList.*`): `{ ...sortableListLabelsFrom(t), ...labels }`. */
export function sortableListLabelsFrom(t: LibraryTexts): SortableListLabels {
  return {
    instructions: t("sortableList.instructions"),
    grabbed: (item, position, count) => t("sortableList.grabbed", { item, position, count }),
    moved: (item, position, count) => t("sortableList.moved", { item, position, count }),
    movedToList: (item, list, position, count) => t("sortableList.movedToList", { item, list, position, count }),
    dropped: (item, position, count) => t("sortableList.dropped", { item, position, count }),
    canceled: (item) => t("sortableList.canceled", { item }),
  };
}

/** What a list tells its behavior, and what the behavior asks of it. */
export interface SortableListHandle {
  readonly id: string;
  /** The lists of one group trade items. */
  readonly group?: string;
  /** Items dragged to another list stay here too (copies go). */
  readonly clone: boolean;
  /** Takes items from other lists of the group. */
  readonly drop: boolean;
  /** Reorders within itself. */
  readonly sort: boolean;
  /** Only elements matching this selector start a drag (".sortable-grab"). */
  readonly handle?: string;
  readonly orientation: Orientation;
  /** The list's name for "moved to …" when the list has no aria-label or aria-labelledby. */
  readonly name: string;
  readonly labels: SortableListLabels;
  readonly count: number;
  /** An item that can't be moved (`ItemFilter`). */
  isFixed(index: number): boolean;
  itemAt(index: number): unknown;
  /** Moves an item within the list. */
  move(from: number, to: number): Promise<void>;
  /** An item leaves for another list (unless the list clones). */
  remove(index: number, args: SortableListEventArgs): Promise<void>;
  /** An item arrives from another list. */
  add(item: unknown, index: number, args: SortableListEventArgs): Promise<void>;
  /** Says something to screen readers. */
  announce(text: string): void;
}

interface Registered {
  readonly element: HTMLElement;
  readonly handle: () => SortableListHandle;
  /** Acts on a key for the item it holds. */
  key?: (key: string) => Promise<void>;
}

/** The lists on the page, by group, in page order. */
const lists = new Set<Registered>();

function groupOf(list: Registered): Registered[] {
  const group = list.handle().group;
  if (group === undefined) return [list];
  return [...lists]
    .filter((other) => other.handle().group === group)
    .sort((a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

const ITEM = "[data-sortable-index]";

/** The list's items: its children that carry an index. */
function items(list: HTMLElement): HTMLElement[] {
  return [...list.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute("data-sortable-index"));
}

function indexOf(item: Element): number {
  return Number(item.getAttribute("data-sortable-index"));
}

/** The text an item says it is: its own label, else its text. */
function nameOf(item: Element | undefined): string {
  return item?.getAttribute("aria-label") ?? item?.textContent?.trim().replace(/\s+/g, " ") ?? "";
}

/** A list's name as a screen reader has it: its aria-label, the text of its aria-labelledby, else its handle's. */
function listName(list: Registered): string {
  const label = list.element.getAttribute("aria-label");
  if (label) return label;
  const ids = list.element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
  const text = ids.map((id) => list.element.ownerDocument.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ");
  return text || list.handle().name;
}

/** The index a drop at `point` inserts at: the number of items whose center lies before it. */
export function sortableInsertIndex(rects: readonly DOMRect[], point: { x: number; y: number }, orientation: Orientation): number {
  let index = 0;
  for (const rect of rects) {
    const center = orientation === "horizontal" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    if ((orientation === "horizontal" ? point.x : point.y) > center) index++;
  }
  return index;
}

/** The list after an item moved from one index to another. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** An item picked up with the keys: where it came from, and where it is. */
interface KeyboardGrab {
  origin: { list: Registered; index: number };
  list: Registered;
  index: number;
  name: string;
}

let grab: KeyboardGrab | undefined;

/**
 * The keys of all lists act in turn (a move renders before the next key acts). Whether an item will be held once the
 * keys before have acted is known at once, so a key is claimed (preventDefault) or left alone right away.
 */
let keys: Promise<void> = Promise.resolve();
let willHold = false;

/** The documents whose keys and presses outside the lists are watched while an item is held. */
const watched = new WeakSet<Document>();

/**
 * While an item is held, a key that lands outside the lists still belongs to it: a move to another list removes the
 * focused node, and until the item is focused in its new list the keys reach the page. A press outside the lists puts
 * the item down.
 */
function watch(document: Document): void {
  if (watched.has(document)) return;
  watched.add(document);
  const inside = (target: EventTarget | null): boolean => target instanceof Node && [...lists].some((list) => list.element.contains(target));
  document.addEventListener("keydown", (event) => {
    if (!willHold || event.defaultPrevented || inside(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (![" ", "Enter", "Escape"].includes(event.key) && !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    if (!event.key.startsWith("Arrow")) willHold = false;
    keys = keys.then(() => grab?.list.key?.(event.key)).catch(() => undefined);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!willHold || inside(event.target)) return;
    willHold = false;
    keys = keys.then(() => grab?.list.key?.(" ")).catch(() => undefined);
  }, true);
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** After a move has rendered: the list focuses the item at `index` and says `text(count)` with its new count. */
async function focusItem(list: Registered, index: number, text?: (count: number) => string): Promise<void> {
  await nextFrame();
  list.element.dispatchEvent(new CustomEvent("sortable-focus", { detail: index }));
  if (text !== undefined) list.handle().announce(text(items(list.element).length));
}

/**
 * The sortable behavior on a list element whose items carry `data-sortable-index`. `handle` gives the list's
 * current settings and callbacks; `indicatorClass` styles the line that shows where a dragged item lands.
 */
export function sortableList(handle: () => SortableListHandle, options: { indicatorClass: string }): Attachment<HTMLElement> {
  return (element) => {
    const self: Registered = { element, handle };
    lists.add(self);
    const document = element.ownerDocument;
    watch(document);

    /** One tab stop: the item that had the focus last (the first at the start). */
    let current = 0;
    const arrange = (): void => {
      const all = items(element);
      if (current >= all.length) current = Math.max(0, all.length - 1);
      for (const [index, item] of all.entries()) {
        const wanted = index === current ? "0" : "-1";
        if (item.getAttribute("tabindex") !== wanted) item.setAttribute("tabindex", wanted);
        // (Data attributes: the renderer owns the class.)
        item.toggleAttribute("data-sortable-grabbed", grab?.list === self && grab.index === index);
      }
    };
    const observer = new MutationObserver(() => arrange());
    observer.observe(element, { childList: true });
    arrange();

    const onFocusIn = (event: FocusEvent): void => {
      const item = (event.target as HTMLElement).closest(ITEM);
      if (item === null || item.parentElement !== element) return;
      current = indexOf(item);
      arrange();
    };

    // ---- The keys -------------------------------------------------------------------------------------------
    const say = (list: Registered, text: string): void => list.handle().announce(text);

    const putDown = (): void => {
      if (grab === undefined) return;
      const { list, index, name } = grab;
      grab = undefined;
      say(list, list.handle().labels.dropped(name, index + 1, items(list.element).length));
      list.element.dispatchEvent(new CustomEvent("sortable-focus", { detail: index }));
    };

    const transfer = async (from: Registered, fromIndex: number, to: Registered, toIndex: number): Promise<void> => {
      const source = from.handle();
      const target = to.handle();
      const args = new SortableListEventArgs(fromIndex, toIndex, source.id, target.id);
      const item = source.itemAt(fromIndex);
      if (!source.clone) await source.remove(fromIndex, args);
      await target.add(item, toIndex, args);
    };

    /**
     * One key, in turn: a move renders before the next key acts (a held arrow key repeats faster than that). While an
     * item is held in this list, the keys act on it wherever its node went; otherwise on the item that had the key.
     */
    const onKey = async (key: string, target: HTMLElement, targetIndex: number): Promise<void> => {
      // The held item went to another list before this key acted: the key is that list's.
      if (grab !== undefined && grab.list !== self && grab.list.key !== undefined) {
        await grab.list.key(key);
        return;
      }
      const settings = handle();
      const along = settings.orientation === "horizontal" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      const across = settings.orientation === "horizontal" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
      const held = grab !== undefined && grab.list === self ? grab : undefined;

      if (key === " " || key === "Enter") {
        if (held !== undefined) {
          putDown();
          return;
        }
        if (settings.isFixed(targetIndex)) return;
        grab = { origin: { list: self, index: targetIndex }, list: self, index: targetIndex, name: nameOf(target) };
        arrange();
        say(self, settings.labels.grabbed(grab.name, targetIndex + 1, settings.count));
        return;
      }
      if (key === "Escape" && held !== undefined) {
        const { origin, name, index } = held;
        grab = undefined;
        arrange();
        if (origin.list === self) await settings.move(index, origin.index);
        else await transfer(self, index, origin.list, origin.index);
        await focusItem(origin.list, origin.index, () => origin.list.handle().labels.canceled(name));
        return;
      }
      if (held !== undefined && along.includes(key)) {
        const to = held.index + (key === along[0] ? -1 : 1);
        if (!settings.sort || to < 0 || to >= settings.count) return;
        await settings.move(held.index, to);
        held.index = to;
        arrange();
        await focusItem(self, to, (count) => settings.labels.moved(held.name, to + 1, count));
        return;
      }
      if (held !== undefined && across.includes(key)) {
        const group = groupOf(self);
        const next = group[group.indexOf(self) + (key === across[0] ? -1 : 1)];
        if (next === undefined || !next.handle().drop) return;
        const to = Math.min(held.index, next.handle().count);
        await transfer(self, held.index, next, to);
        held.list = next;
        held.index = to;
        arrange();
        next.element.dispatchEvent(new CustomEvent("sortable-arrange"));
        await focusItem(next, to, (count) => next.handle().labels.movedToList(held.name, listName(next), to + 1, count));
        return;
      }
      if (held !== undefined) return;
      // Nothing picked up: the arrow keys, Home and End move the focus.
      const all = items(element);
      let next: number | undefined;
      if (key === along[0]) next = Math.max(0, targetIndex - 1);
      if (key === along[1]) next = Math.min(all.length - 1, targetIndex + 1);
      if (key === "Home") next = 0;
      if (key === "End") next = all.length - 1;
      if (next === undefined) return;
      current = next;
      arrange();
      all[next]?.focus();
    };

    self.key = (key) => {
      const held = grab?.list === self ? items(element)[grab.index] : undefined;
      return held === undefined ? Promise.resolve() : onKey(key, held, indexOf(held));
    };
    const keydown = (event: KeyboardEvent): void => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
      if (target === null || target.parentElement !== element || event.altKey || event.ctrlKey || event.metaKey) return;
      const settings = handle();
      const index = indexOf(target);
      const along = settings.orientation === "horizontal" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
      let ours: boolean;
      if (event.key === " " || event.key === "Enter") {
        // Space and Enter on a control inside an item are the control's.
        ours = event.target === target;
        if (ours) willHold = willHold ? false : !settings.isFixed(index);
      } else if (event.key === "Escape") {
        // Escape is an outer layer's unless an item is held.
        ours = willHold;
        willHold = false;
      } else if (event.key.startsWith("Arrow")) {
        ours = willHold || along.includes(event.key);
      } else {
        ours = !willHold && (event.key === "Home" || event.key === "End");
      }
      if (!ours) return;
      event.preventDefault();
      keys = keys.then(() => onKey(event.key, target, index)).catch(() => undefined);
    };

    // An item picked up loses its grab when the focus leaves it for good.
    const onFocusOut = (event: FocusEvent): void => {
      if (grab?.list !== self) return;
      const next = event.relatedTarget as Node | null;
      if (next !== null && groupOf(self).some((list) => list.element.contains(next))) return;
      if (next === null) return;
      willHold = false;
      putDown();
    };

    // ---- The pointer ----------------------------------------------------------------------------------------
    let drag: { pointer: number; item: HTMLElement; index: number; start: { x: number; y: number }; moving: boolean } | undefined;
    let indicator: HTMLElement | undefined;
    let target: { list: Registered; index: number } | undefined;

    const showIndicator = (list: Registered, index: number): void => {
      const all = items(list.element).filter((item) => item !== drag?.item || list !== self);
      const horizontal = list.handle().orientation === "horizontal";
      const box = list.element.getBoundingClientRect();
      const before = all[index];
      const after = all[index - 1];
      if (indicator === undefined) {
        indicator = document.body.appendChild(document.createElement("div"));
        // Above a list in a dialog or drawer: the top layer.
        showInTopLayer(indicator);
      }
      indicator.className = options.indicatorClass;
      indicator.setAttribute("aria-hidden", "true");
      const edge = before !== undefined
        ? (horizontal ? before.getBoundingClientRect().left : before.getBoundingClientRect().top)
        : after !== undefined
          ? (horizontal ? after.getBoundingClientRect().right : after.getBoundingClientRect().bottom)
          : (horizontal ? box.left : box.top);
      Object.assign(indicator.style, horizontal
        ? { position: "fixed", left: `${edge - 1}px`, top: `${box.top}px`, width: "2px", height: `${box.height}px` }
        : { position: "fixed", left: `${box.left}px`, top: `${edge - 1}px`, width: `${box.width}px`, height: "2px" });
    };

    const hideIndicator = (): void => {
      indicator?.remove();
      indicator = undefined;
    };

    const listAt = (x: number, y: number): Registered | undefined => {
      const hit = document.elementFromPoint(x, y);
      return groupOf(self).find((list) => list.element === hit || (hit !== null && list.element.contains(hit)));
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || drag !== undefined || grab !== undefined) return;
      const item = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
      if (item === null || item.parentElement !== element) return;
      const settings = handle();
      const index = indexOf(item);
      if (settings.isFixed(index)) return;
      if (settings.handle !== undefined && (event.target as HTMLElement).closest(settings.handle) === null) return;
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]") !== null) return;
      dragged = false;
      drag = { pointer: event.pointerId, item, index, start: { x: event.clientX, y: event.clientY }, moving: false };
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (drag === undefined || event.pointerId !== drag.pointer) return;
      if (!drag.moving) {
        if (Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 4) return;
        drag.moving = true;
        drag.item.setAttribute("data-sortable-dragging", "");
        element.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      const list = listAt(event.clientX, event.clientY);
      const settings = list?.handle();
      if (list === undefined || settings === undefined || (list === self ? !settings.sort : !settings.drop)) {
        target = undefined;
        hideIndicator();
        return;
      }
      const rects = items(list.element).filter((item) => list !== self || item !== drag?.item).map((item) => item.getBoundingClientRect());
      const index = sortableInsertIndex(rects, { x: event.clientX, y: event.clientY }, settings.orientation);
      target = { list, index };
      showIndicator(list, index);
    };

    const end = async (event: PointerEvent, commit: boolean): Promise<void> => {
      if (drag === undefined || event.pointerId !== drag.pointer) return;
      const { item, index, moving } = drag;
      drag = undefined;
      item.removeAttribute("data-sortable-dragging");
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
      hideIndicator();
      const to = target;
      target = undefined;
      if (!moving || !commit || to === undefined) return;
      if (to.list === self) {
        if (to.index !== index) await handle().move(index, to.index);
      } else {
        await transfer(self, index, to.list, to.index);
      }
    };
    const pointerUp = (event: PointerEvent): void => void end(event, true);
    const pointerCancel = (event: PointerEvent): void => void end(event, false);
    // A drag ends without the click its pointerup would make.
    let dragged = false;
    const swallowClick = (event: MouseEvent): void => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const markDragged = (event: PointerEvent): void => {
      if (drag?.moving && event.pointerId === drag.pointer) dragged = true;
    };
    const onArrangeRequest = (): void => arrange();
    /** After a move: the tab stop and the focus on the item at the index. */
    const onFocusRequest = (event: Event): void => {
      current = (event as CustomEvent<number>).detail;
      arrange();
      items(element)[current]?.focus();
    };

    element.addEventListener("focusin", onFocusIn);
    element.addEventListener("focusout", onFocusOut);
    element.addEventListener("keydown", keydown);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", markDragged, true);
    element.addEventListener("pointerup", pointerUp);
    element.addEventListener("pointercancel", pointerCancel);
    element.addEventListener("click", swallowClick, true);
    element.addEventListener("sortable-focus", onFocusRequest);
    element.addEventListener("sortable-arrange", onArrangeRequest);
    return () => {
      lists.delete(self);
      if (grab?.list === self) {
        grab = undefined;
        willHold = false;
      }
      observer.disconnect();
      hideIndicator();
      element.removeEventListener("focusin", onFocusIn);
      element.removeEventListener("focusout", onFocusOut);
      element.removeEventListener("keydown", keydown);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", markDragged, true);
      element.removeEventListener("pointerup", pointerUp);
      element.removeEventListener("pointercancel", pointerCancel);
      element.removeEventListener("click", swallowClick, true);
      element.removeEventListener("sortable-focus", onFocusRequest);
      element.removeEventListener("sortable-arrange", onArrangeRequest);
    };
  };
}

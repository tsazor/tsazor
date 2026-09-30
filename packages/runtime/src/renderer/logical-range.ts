import type { DomJournal } from "./dom-journal.js";

/**
 * Logical ranges — Blazor's "logical elements" (LogicalElements.ts) as an
 * explicit abstraction. A component's output and a markup block span any
 * number of DOM siblings; a range delimits them with a start and an end
 * comment, and counts as ONE logical child of whatever contains it (an element
 * or an enclosing range). Ranges nest: a child component's range sits inside
 * its parent's range, and walking the parent's logical children jumps over it
 * (start → end) as a unit.
 *
 * Every DOM node between the markers belongs to the range, so inserting,
 * moving or removing the sibling run start..end handles the range with all
 * nested content — nothing is left behind. Structural operations accept an
 * optional DomJournal and record each node they touch (see DomJournal).
 */
export class LogicalRange {
  readonly start: Comment;
  readonly end: Comment;

  constructor(label: string) {
    this.start = document.createComment(label);
    this.end = document.createComment(`/${label}`);
    rangesByStart.set(this.start, this);
  }

  /** The range whose start marker is `node`, if any. */
  static startingAt(node: Node): LogicalRange | undefined {
    return node.nodeType === COMMENT_NODE ? rangesByStart.get(node) : undefined;
  }

  /** The DOM node the range currently lives in (null when detached). */
  get parentNode(): Node | null {
    return this.start.parentNode;
  }

  /** First DOM node of the first logical child, or null when the range is empty. */
  get firstChild(): Node | null {
    const node = this.start.nextSibling;
    return node === this.end ? null : node;
  }

  /** The logical children: DOM nodes, with nested ranges as their LogicalRange. */
  children(): Array<Node | LogicalRange> {
    const result: Array<Node | LogicalRange> = [];
    for (let node: Node | null = this.start.nextSibling; node !== null && node !== this.end; node = nextLogicalSibling(node)) {
      result.push(LogicalRange.startingAt(node) ?? node);
    }
    return result;
  }

  /** All DOM nodes of the range in document order, markers included. */
  nodes(): Node[] {
    const result: Node[] = [];
    for (let node: Node | null = this.start; node !== null; node = node.nextSibling) {
      result.push(node);
      if (node === this.end) break;
    }
    return result;
  }

  /**
   * Inserts the range before `before` in `parent` as a unit: a fresh range
   * is placed (its markers, plus whatever is already between them); an
   * attached one is moved with all its content.
   */
  insertBefore(parent: Node, before: Node | null, journal: DomJournal | null = null): void {
    if (this.start.parentNode === null) {
      journal?.position(this.start);
      parent.insertBefore(this.start, before);
      journal?.position(this.end);
      parent.insertBefore(this.end, before);
    } else {
      moveRun(this.start, this.end, parent, before, journal);
    }
  }

  /** Removes the range with all its content from the DOM; returns the node after it. */
  remove(journal: DomJournal | null = null): Node | null {
    return removeRun(this.start, this.end, journal);
  }
}

const COMMENT_NODE = 8;

const rangesByStart = new WeakMap<Node, LogicalRange>();

/* ------------------------------------------------------------------ */
/* Logical children                                                    */
/* ------------------------------------------------------------------ */

/**
 * A logical child is identified by its first DOM node: a plain node, or the
 * start marker of a range. These helpers treat both uniformly.
 */

/** Last DOM node of the logical child starting at `node` (a range's end marker). */
export function lastNodeOf(node: Node): Node {
  return node.nodeType === COMMENT_NODE ? (rangesByStart.get(node)?.end ?? node) : node;
}

/** First DOM node of the logical child after the one starting at `node`. */
export function nextLogicalSibling(node: Node): Node | null {
  return lastNodeOf(node).nextSibling;
}

/** Moves the logical child starting at `first` before `before` in `parent`. */
export function moveLogicalChild(first: Node, parent: Node, before: Node | null, journal: DomJournal | null): void {
  moveRun(first, lastNodeOf(first), parent, before, journal);
}

/** Removes the logical child starting at `first`; returns the node after it. */
export function removeLogicalChild(first: Node, journal: DomJournal | null): Node | null {
  return removeRun(first, lastNodeOf(first), journal);
}

/**
 * The logical children of an element, or of a range: the unit the applier's
 * sibling indices count in (Blazor's logical-child indices). Carries a forward
 * cursor, because the edits of one level come in ascending sibling order.
 */
export class LogicalChildren {
  /** Cursor: a logical child index and its first DOM node (the boundary when past the end). */
  index = 0;
  node: Node | null;
  /** DOM parent of the children. */
  readonly parent: Node;
  /** Exclusive end: the range's end marker, or null for an element. */
  readonly boundary: Node | null;

  constructor(private readonly container: Element | LogicalRange) {
    if (container instanceof LogicalRange) {
      this.parent = container.parentNode!;
      this.boundary = container.end;
    } else {
      this.parent = container;
      this.boundary = null;
    }
    this.node = this.first();
  }

  /** First DOM node of the first child (the boundary when empty). */
  first(): Node | null {
    const container = this.container;
    return container instanceof LogicalRange ? container.start.nextSibling : container.firstChild;
  }

  /** First DOM node of child `siblingIndex` (the boundary when past the end); moves the cursor. */
  at(siblingIndex: number): Node | null {
    let index = this.index;
    let node = this.node;
    if (siblingIndex < index) {
      index = 0;
      node = this.first();
    }
    while (index < siblingIndex) {
      node = nextLogicalSibling(node!);
      index++;
    }
    this.index = index;
    this.node = node;
    return node;
  }

  /** Points the cursor at child `index`, whose first node is `node`. */
  seek(index: number, node: Node | null): void {
    this.index = index;
    this.node = node;
  }

  /** First DOM nodes of all children, in order. */
  list(): Node[] {
    const result: Node[] = [];
    for (let node = this.first(); node !== null && node !== this.boundary; node = nextLogicalSibling(node)) {
      result.push(node);
    }
    return result;
  }

  /**
   * Blazor's permuteLogicalChildren: moves children (by current sibling
   * index) to target indices, all as units. Every source and target is
   * resolved against the order BEFORE the permutation (a placeholder marks
   * each target), then each child moves to its placeholder. Resets the cursor.
   */
  permute(moves: ReadonlyArray<{ readonly from: number; readonly to: number }>, journal: DomJournal | null): void {
    const siblings = this.list();
    const parent = this.parent;
    const placeholders: Comment[] = [];
    for (const { to } of moves) {
      const placeholder = document.createComment("");
      journal?.position(placeholder);
      parent.insertBefore(placeholder, siblings[to + 1] ?? this.boundary);
      placeholders.push(placeholder);
    }
    for (let i = 0; i < moves.length; i++) {
      const placeholder = placeholders[i]!;
      moveLogicalChild(siblings[moves[i]!.from]!, parent, placeholder, journal);
      journal?.position(placeholder);
      parent.removeChild(placeholder);
    }
    this.seek(0, this.first());
  }
}

/* ------------------------------------------------------------------ */
/* Sibling runs                                                        */
/* ------------------------------------------------------------------ */

/** Moves the sibling run first..last (inclusive) before `before` in `parent`. */
function moveRun(first: Node, last: Node, parent: Node, before: Node | null, journal: DomJournal | null): void {
  let current: Node = first;
  for (;;) {
    const next = current.nextSibling;
    journal?.position(current);
    parent.insertBefore(current, before);
    if (current === last || next === null) break;
    current = next;
  }
}

/** Removes the sibling run first..last (inclusive); returns the node after it. */
function removeRun(first: Node, last: Node, journal: DomJournal | null): Node | null {
  const parent = first.parentNode;
  if (parent === null) return null;
  let current: Node = first;
  for (;;) {
    const next = current.nextSibling;
    journal?.position(current);
    parent.removeChild(current);
    if (current === last || next === null) return next;
    current = next;
  }
}

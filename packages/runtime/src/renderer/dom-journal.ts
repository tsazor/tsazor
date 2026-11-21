/**
 * Undo log of one render pass's DOM application (roadmap B3). Every mutation
 * of DOM that was live before the pass records how to restore it; a pass that
 * fails part-way is rolled back in reverse order, so the DOM again matches the
 * component's retained live tree (the diff base of its next pass).
 *
 * Only pre-existing DOM is journaled: subtrees built detached for a
 * PrependFrame are discarded as a whole by undoing their single insertion.
 * Entries are a flat array (kind, target, a, b) — no allocation per record.
 */
import { writeAttribute } from "./dom-attributes.js";

const enum EntryKind {
  /** `target` was at (parent `a`, next sibling `b`), or detached when `a` is null. */
  Position,
  /** Content attribute `a` of element `target` had value `b` (null: absent). */
  Attribute,
  /** Property `a` of `target` had value `b`. */
  Property,
  /** Custom restore: `a(target, b)`. */
  Restore,
}

const STRIDE = 4;

export class DomJournal {
  private readonly entries: unknown[] = [];

  /** Call before `node` is inserted, moved or removed. */
  position(node: Node): void {
    this.entries.push(EntryKind.Position, node, node.parentNode, node.nextSibling);
  }

  /** Call before content attribute `name` of `element` changes. */
  attribute(element: Element, name: string): void {
    this.entries.push(EntryKind.Attribute, element, name, element.getAttribute(name));
  }

  /** Call before property `name` of `target` changes. */
  property(target: object, name: string): void {
    this.entries.push(EntryKind.Property, target, name, (target as Record<string, unknown>)[name]);
  }

  /** Records a custom undo step: `restore(target, value)` on rollback. */
  restore<T extends object, V>(target: T, restore: (target: T, value: V) => void, value: V): void {
    this.entries.push(EntryKind.Restore, target, restore, value);
  }

  /** Forgets the recorded steps (the pass committed). */
  clear(): void {
    this.entries.length = 0;
  }

  /**
   * Undoes every recorded step, newest first. Restoring a position in reverse
   * order is exact: when a step is undone, every later mutation already is,
   * so its recorded next sibling is back in place. Never throws; steps that
   * fail to undo are skipped.
   */
  rollback(): void {
    const entries = this.entries;
    for (let i = entries.length - STRIDE; i >= 0; i -= STRIDE) {
      const target = entries[i + 1];
      const a = entries[i + 2];
      const b = entries[i + 3];
      try {
        switch (entries[i] as EntryKind) {
          case EntryKind.Position:
            if (a === null) (target as ChildNode).remove();
            else (a as Node).insertBefore(target as Node, b as Node | null);
            break;
          case EntryKind.Attribute:
            if (b === null) (target as Element).removeAttribute(a as string);
            else writeAttribute(target as Element, a as string, b as string);
            break;
          case EntryKind.Property:
            (target as Record<string, unknown>)[a as string] = b;
            break;
          case EntryKind.Restore:
            (a as (target: unknown, value: unknown) => void)(target, b);
            break;
        }
      } catch {
        // Best effort: keep undoing the remaining steps.
      }
    }
    entries.length = 0;
  }
}

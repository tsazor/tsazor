import type { RenderTreeFrame } from "./render-tree.js";
import { getFrameSubtreeLength } from "./render-tree.js";
import { FrameType } from "./frame-type.js";
import { EventCallback } from "../components/event-callback.js";

/**
 * Edit kinds of a render tree diff, mirroring Blazor's RenderTreeEditType
 * (same names and values, so the JS BrowserRenderer semantics carry over).
 */
export const enum RenderTreeEditType {
  /** Insert the frame `referenceFrameIndex` (new tree, whole subtree) before `siblingIndex`. */
  PrependFrame = 1,
  /** Remove the logical child at `siblingIndex`. */
  RemoveFrame = 2,
  /** Set attribute frame `referenceFrameIndex` on the element at `siblingIndex`. */
  SetAttribute = 3,
  /** Remove attribute `removedAttributeName` from the element at `siblingIndex`. */
  RemoveAttribute = 4,
  /** Replace the text of the text node at `siblingIndex` with frame `referenceFrameIndex`. */
  UpdateText = 5,
  /** Descend into the element at `siblingIndex`; following indices are its children. */
  StepIn = 6,
  /** Return to the parent level. */
  StepOut = 7,
  /** Replace the markup block at `siblingIndex` with frame `referenceFrameIndex`. */
  UpdateMarkup = 8,
  /** Move the logical child at `siblingIndex` to `moveToSiblingIndex` (applied as one permutation). */
  PermutationListEntry = 9,
  /** Terminates a run of PermutationListEntry edits. */
  PermutationListEnd = 10,
}

/**
 * One edit of the diff (Blazor's RenderTreeEdit). Sibling indices count the
 * logical children of the current level: elements, text nodes, markup blocks
 * and child components count one each, regions are flattened. Every edit has
 * all fields (one monomorphic shape); unused ones are -1 / null.
 */
export interface RenderTreeEdit {
  readonly type: RenderTreeEditType;
  readonly siblingIndex: number;
  /** Frame index into the NEW tree (PrependFrame, SetAttribute, UpdateText, UpdateMarkup). */
  readonly referenceFrameIndex: number;
  /** Target sibling index (PermutationListEntry). */
  readonly moveToSiblingIndex: number;
  /** Attribute name (RemoveAttribute). */
  readonly removedAttributeName: string | null;
}

/**
 * Result of diffing one component's previous render tree against its new one.
 * Pure data: computing it touches neither the DOM nor any component state.
 */
export interface RenderTreeDiff {
  readonly edits: RenderTreeEdit[];
  /**
   * Child component frames of the new tree in diff order, as flat
   * `(oldFrameIndex, newFrameIndex)` pairs: `oldFrameIndex === -1` means the
   * frame needs a new component instance, otherwise the instance of the old
   * frame is retained. Blazor instantiates/updates these during the diff;
   * here the renderer does it from this list.
   */
  readonly components: number[];
  /**
   * Old-tree frame indices of child components to dispose — including
   * components nested (at any depth of this tree) inside removed elements.
   * Blazor's ComponentDisposalQueue.
   */
  readonly disposedComponents: number[];
}

export interface DiffOptions {
  /**
   * Whether an old and a new component frame denote the same component type.
   * Defaults to identity; the renderer widens it for hot-swapped modules.
   */
  isSameComponentType?: (oldType: unknown, newType: unknown) => boolean;
}

type Key = string | number;

/** Blazor's KeyedItemInfo: where a key sits in the old/new sibling ranges. */
interface KeyedItemInfo {
  oldIndex: number;
  newIndex: number;
  oldSiblingIndex: number;
  newSiblingIndex: number;
}

interface DiffContext {
  readonly oldTree: RenderTreeFrame[];
  readonly newTree: RenderTreeFrame[];
  readonly edits: RenderTreeEdit[];
  readonly components: number[];
  readonly disposedComponents: number[];
  readonly isSameComponentType: (oldType: unknown, newType: unknown) => boolean;
  siblingIndex: number;
}

const identity = (a: unknown, b: unknown): boolean => a === b;

/**
 * Computes the edits that turn `oldTree` into `newTree` — a port of Blazor's
 * RenderTreeDiffBuilder: an ordered two-pointer walk over sibling frames by
 * sequence number (with loop-back detection for repeated sequences); a key
 * dictionary is built only when a key is present, a key miss is always
 * remove + insert (never a sequence fallback), and duplicate keys throw.
 * The initial render is a diff against an empty old tree.
 */
export function computeDiff(oldTree: RenderTreeFrame[], newTree: RenderTreeFrame[], options?: DiffOptions): RenderTreeDiff {
  const ctx: DiffContext = {
    oldTree,
    newTree,
    edits: [],
    components: [],
    disposedComponents: [],
    isSameComponentType: options?.isSameComponentType ?? identity,
    siblingIndex: 0,
  };
  appendDiffEntriesForRange(ctx, 0, oldTree.length, 0, newTree.length);
  return { edits: ctx.edits, components: ctx.components, disposedComponents: ctx.disposedComponents };
}

const enum DiffAction {
  Match,
  Insert,
  Delete,
}

function appendDiffEntriesForRange(ctx: DiffContext, oldStartIndex: number, oldEndIndexExcl: number, newStartIndex: number, newEndIndexExcl: number): void {
  // Kept as one large function like Blazor's (which measured ~10% cost for
  // splitting it); the #region-style comments mark the inlined parts.
  const origOldStartIndex = oldStartIndex;
  const origNewStartIndex = newStartIndex;
  const oldTree = ctx.oldTree;
  const newTree = ctx.newTree;
  let prevOldSeq = -1;
  let prevNewSeq = -1;
  let matchWithNewTreeIndex = -1;
  let keyedItemInfos: Map<Key, KeyedItemInfo> | null = null;

  for (;;) {
    // Attribute frames are never siblings (the builder does not reject stray
    // ones outside an element's leading attribute run; the old matcher skipped them too).
    while (oldStartIndex < oldEndIndexExcl && isAttribute(oldTree[oldStartIndex]!)) oldStartIndex++;
    while (newStartIndex < newEndIndexExcl && isAttribute(newTree[newStartIndex]!)) newStartIndex++;
    const hasMoreOld = oldStartIndex < oldEndIndexExcl;
    const hasMoreNew = newStartIndex < newEndIndexExcl;
    if (!hasMoreOld && !hasMoreNew) break;

    // Read keys and sequence numbers
    let oldSeq: number;
    let newSeq: number;
    let oldKey: Key | null;
    let newKey: Key | null;
    if (hasMoreOld) {
      const oldFrame = oldTree[oldStartIndex]!;
      oldSeq = oldFrame.sequence;
      oldKey = keyValue(oldFrame);
    } else {
      oldSeq = Number.MAX_SAFE_INTEGER;
      oldKey = null;
    }
    if (hasMoreNew) {
      const newFrame = newTree[newStartIndex]!;
      newSeq = newFrame.sequence;
      newKey = keyValue(newFrame);
    } else {
      newSeq = Number.MAX_SAFE_INTEGER;
      newKey = null;
    }

    let action: DiffAction;
    if (oldKey !== null || newKey !== null) {
      // Get diff action by matching on key. Build (and validate: duplicate
      // keys throw) the lookup as soon as any key shows up, even if it matches.
      keyedItemInfos ??= buildKeyToInfoLookup(ctx, origOldStartIndex, oldEndIndexExcl, origNewStartIndex, newEndIndexExcl);
      if (oldKey === newKey) {
        action = DiffAction.Match;
        matchWithNewTreeIndex = newStartIndex;
      } else {
        const oldKeyItemInfo = oldKey !== null ? keyedItemInfos.get(oldKey)! : null;
        const newKeyItemInfo = newKey !== null ? keyedItemInfos.get(newKey)! : null;
        const oldKeyIsInNewTree = oldKeyItemInfo !== null && oldKeyItemInfo.newIndex >= 0;
        const newKeyIsInOldTree = newKeyItemInfo !== null && newKeyItemInfo.oldIndex >= 0;

        // If either key is not in the other tree, this iteration is an insert
        // or a delete; only when both keys are in both trees is it a move.
        if (oldKeyIsInNewTree && newKeyIsInOldTree) {
          // Move: the recipient still has the old item (oldKey) at the current
          // sibling index, so update it in place against its new frame and
          // permute afterwards. Sibling indices only grow from here on, so
          // the ones recorded now stay valid.
          action = DiffAction.Match;
          matchWithNewTreeIndex = oldKeyItemInfo!.newIndex;
          oldKeyItemInfo!.oldSiblingIndex = ctx.siblingIndex;
          newKeyItemInfo!.newSiblingIndex = ctx.siblingIndex;
        } else if (!hasMoreNew) {
          // Out of new items: this is an old item, delete it.
          action = DiffAction.Delete;
        } else {
          // If the new key is in both trees but the old one is not, the old
          // item was deleted; otherwise treat it as an insertion.
          action = newKeyIsInOldTree ? DiffAction.Delete : DiffAction.Insert;
        }
      }
    } else {
      // Get diff action by matching on sequence number
      if (oldSeq === newSeq) {
        action = DiffAction.Match;
        matchWithNewTreeIndex = newStartIndex;
      } else {
        const oldLoopedBack = oldSeq <= prevOldSeq;
        const newLoopedBack = newSeq <= prevNewSeq;
        if (oldLoopedBack === newLoopedBack) {
          // Both sides proceed through the same loop block: a preordered
          // merge join, picking the side that brings us closer to being in sync.
          action = newSeq < oldSeq ? DiffAction.Insert : DiffAction.Delete;
          if (oldLoopedBack) {
            // Both looped back: reset the trackers so both count as the same block.
            prevOldSeq = -1;
            prevNewSeq = -1;
          }
        } else if (oldLoopedBack) {
          // Old looped back but new did not: the new side either has extra
          // trailing items in the current loop block (insert) or omits some
          // old trailing loop blocks (delete).
          let newLoopsBackLater = false;
          for (let testIndex = newStartIndex + 1; testIndex < newEndIndexExcl; testIndex++) {
            if (newTree[testIndex]!.sequence < newSeq) {
              newLoopsBackLater = true;
              break;
            }
          }
          action = newLoopsBackLater ? DiffAction.Insert : DiffAction.Delete;
        } else {
          // New looped back but old did not: mirror image of the case above.
          let oldLoopsBackLater = false;
          for (let testIndex = oldStartIndex + 1; testIndex < oldEndIndexExcl; testIndex++) {
            if (oldTree[testIndex]!.sequence < oldSeq) {
              oldLoopsBackLater = true;
              break;
            }
          }
          action = oldLoopsBackLater ? DiffAction.Delete : DiffAction.Insert;
        }
      }
    }

    // Apply diff action
    switch (action) {
      case DiffAction.Match:
        appendDiffEntriesForFramesWithSameSequence(ctx, oldStartIndex, matchWithNewTreeIndex);
        oldStartIndex += getFrameSubtreeLength(oldTree[oldStartIndex]!);
        newStartIndex += getFrameSubtreeLength(newTree[newStartIndex]!);
        prevOldSeq = oldSeq;
        prevNewSeq = newSeq;
        break;
      case DiffAction.Insert:
        insertNewFrame(ctx, newStartIndex);
        newStartIndex += getFrameSubtreeLength(newTree[newStartIndex]!);
        prevNewSeq = newSeq;
        break;
      case DiffAction.Delete:
        removeOldFrame(ctx, oldStartIndex);
        oldStartIndex += getFrameSubtreeLength(oldTree[oldStartIndex]!);
        prevOldSeq = oldSeq;
        break;
    }
  }

  // Write permutations list
  if (keyedItemInfos !== null) {
    let hasPermutations = false;
    for (const info of keyedItemInfos.values()) {
      if (info.oldSiblingIndex >= 0 && info.newSiblingIndex >= 0) {
        hasPermutations = true;
        ctx.edits.push(edit(RenderTreeEditType.PermutationListEntry, info.oldSiblingIndex, -1, info.newSiblingIndex, null));
      }
    }
    if (hasPermutations) {
      // Explicit end marker: easier for the applier than counting entries.
      ctx.edits.push(edit(RenderTreeEditType.PermutationListEnd, 0, -1, -1, null));
    }
  }
}

function buildKeyToInfoLookup(ctx: DiffContext, oldStartIndex: number, oldEndIndexExcl: number, newStartIndex: number, newEndIndexExcl: number): Map<Key, KeyedItemInfo> {
  const result = new Map<Key, KeyedItemInfo>();
  const oldTree = ctx.oldTree;
  const newTree = ctx.newTree;

  while (oldStartIndex < oldEndIndexExcl) {
    const frame = oldTree[oldStartIndex]!;
    const key = keyValue(frame);
    if (key !== null) {
      if (result.has(key)) throwForDuplicateKey(key, frame);
      result.set(key, { oldIndex: oldStartIndex, newIndex: -1, oldSiblingIndex: -1, newSiblingIndex: -1 });
    }
    oldStartIndex += getFrameSubtreeLength(frame);
  }

  while (newStartIndex < newEndIndexExcl) {
    const frame = newTree[newStartIndex]!;
    const key = keyValue(frame);
    if (key !== null) {
      const existing = result.get(key);
      if (existing === undefined) {
        result.set(key, { oldIndex: -1, newIndex: newStartIndex, oldSiblingIndex: -1, newSiblingIndex: -1 });
      } else {
        if (existing.newIndex >= 0) throwForDuplicateKey(key, frame);
        existing.newIndex = newStartIndex;
      }
    }
    newStartIndex += getFrameSubtreeLength(frame);
  }
  return result;
}

function throwForDuplicateKey(key: Key, frame: RenderTreeFrame): never {
  switch (frame.frameType) {
    case FrameType.Component: {
      const name = (frame.componentType as { name?: string } | undefined)?.name ?? "?";
      throw new Error(`More than one sibling of component '${name}' has the same key value, '${String(key)}'. Key values must be unique.`);
    }
    case FrameType.Element:
      throw new Error(`More than one sibling of element '${frame.elementName}' has the same key value, '${String(key)}'. Key values must be unique.`);
    default:
      throw new Error(`More than one sibling has the same key value, '${String(key)}'. Key values must be unique.`);
  }
}

function appendDiffEntriesForFramesWithSameSequence(ctx: DiffContext, oldFrameIndex: number, newFrameIndex: number): void {
  const oldTree = ctx.oldTree;
  const newTree = ctx.newTree;
  const oldFrame = oldTree[oldFrameIndex]!;
  const newFrame = newTree[newFrameIndex]!;

  // Cannot happen for sequence-matched compiler output, but can with
  // hand-written builders or two siblings sharing a key.
  if (oldFrame.frameType !== newFrame.frameType) {
    insertNewFrame(ctx, newFrameIndex);
    removeOldFrame(ctx, oldFrameIndex);
    return;
  }

  switch (newFrame.frameType) {
    case FrameType.Text: {
      if (oldFrame.textContent !== newFrame.textContent) {
        ctx.edits.push(edit(RenderTreeEditType.UpdateText, ctx.siblingIndex, newFrameIndex, -1, null));
      }
      ctx.siblingIndex++;
      break;
    }

    case FrameType.Markup: {
      if (oldFrame.markupContent !== newFrame.markupContent) {
        ctx.edits.push(edit(RenderTreeEditType.UpdateMarkup, ctx.siblingIndex, newFrameIndex, -1, null));
      }
      ctx.siblingIndex++;
      break;
    }

    case FrameType.Element: {
      if (oldFrame.elementName === newFrame.elementName) {
        const oldAttributesEndIndexExcl = attributesEndIndexExclusive(oldTree, oldFrameIndex);
        const newAttributesEndIndexExcl = attributesEndIndexExclusive(newTree, newFrameIndex);

        // Diff the attributes
        appendAttributeDiffEntriesForRange(ctx, oldFrameIndex + 1, oldAttributesEndIndexExcl, newFrameIndex + 1, newAttributesEndIndexExcl);

        // Diff the children
        const oldChildrenEndIndexExcl = oldFrameIndex + getFrameSubtreeLength(oldFrame);
        const newChildrenEndIndexExcl = newFrameIndex + getFrameSubtreeLength(newFrame);
        const hasChildrenToProcess = oldChildrenEndIndexExcl > oldAttributesEndIndexExcl || newChildrenEndIndexExcl > newAttributesEndIndexExcl;
        if (hasChildrenToProcess) {
          ctx.edits.push(edit(RenderTreeEditType.StepIn, ctx.siblingIndex, -1, -1, null));
          const prevSiblingIndex = ctx.siblingIndex;
          ctx.siblingIndex = 0;
          appendDiffEntriesForRange(ctx, oldAttributesEndIndexExcl, oldChildrenEndIndexExcl, newAttributesEndIndexExcl, newChildrenEndIndexExcl);
          appendStepOut(ctx);
          ctx.siblingIndex = prevSiblingIndex + 1;
        } else {
          ctx.siblingIndex++;
        }
      } else {
        // Elements with different names are unrelated.
        insertNewFrame(ctx, newFrameIndex);
        removeOldFrame(ctx, oldFrameIndex);
      }
      break;
    }

    case FrameType.Component: {
      if (ctx.isSameComponentType(oldFrame.componentType, newFrame.componentType)) {
        // Retained. Blazor skips SetParameters when the parameters definitely
        // did not change (MayHaveChangedSince); Tsazor re-sets them on every
        // parent render until change detection lands (roadmap B6).
        ctx.components.push(oldFrameIndex, newFrameIndex);
        ctx.siblingIndex++;
      } else {
        // Child components of different types are unrelated.
        insertNewFrame(ctx, newFrameIndex);
        removeOldFrame(ctx, oldFrameIndex);
      }
      break;
    }

    case FrameType.Region: {
      appendDiffEntriesForRange(
        ctx,
        oldFrameIndex + 1,
        oldFrameIndex + getFrameSubtreeLength(oldFrame),
        newFrameIndex + 1,
        newFrameIndex + getFrameSubtreeLength(newFrame),
      );
      break;
    }

    case FrameType.ElementReferenceCapture:
      // Like Blazor: a reference is captured only when its element is first rendered.
      break;

    default:
      break;
  }
}

function insertNewFrame(ctx: DiffContext, newFrameIndex: number): void {
  const newTree = ctx.newTree;
  const newFrame = newTree[newFrameIndex]!;
  switch (newFrame.frameType) {
    case FrameType.Attribute:
    case FrameType.EventHandler:
      ctx.edits.push(edit(RenderTreeEditType.SetAttribute, ctx.siblingIndex, newFrameIndex, -1, null));
      break;
    case FrameType.Component:
    case FrameType.Element:
      initializeNewSubtree(ctx, newFrameIndex);
      ctx.edits.push(edit(RenderTreeEditType.PrependFrame, ctx.siblingIndex, newFrameIndex, -1, null));
      ctx.siblingIndex++;
      break;
    case FrameType.Region: {
      const endIndexExcl = newFrameIndex + getFrameSubtreeLength(newFrame);
      let childIndex = newFrameIndex + 1;
      while (childIndex < endIndexExcl) {
        insertNewFrame(ctx, childIndex);
        childIndex += getFrameSubtreeLength(newTree[childIndex]!);
      }
      break;
    }
    case FrameType.Text:
    case FrameType.Markup:
      ctx.edits.push(edit(RenderTreeEditType.PrependFrame, ctx.siblingIndex, newFrameIndex, -1, null));
      ctx.siblingIndex++;
      break;
    case FrameType.ElementReferenceCapture:
    default:
      break;
  }
}

function removeOldFrame(ctx: DiffContext, oldFrameIndex: number): void {
  const oldTree = ctx.oldTree;
  const oldFrame = oldTree[oldFrameIndex]!;
  switch (oldFrame.frameType) {
    case FrameType.Attribute:
    case FrameType.EventHandler:
      ctx.edits.push(edit(RenderTreeEditType.RemoveAttribute, ctx.siblingIndex, -1, -1, oldFrame.attributeName ?? null));
      break;
    case FrameType.Component:
    case FrameType.Element:
      disposeFramesInRange(ctx, oldFrameIndex, oldFrameIndex + getFrameSubtreeLength(oldFrame));
      ctx.edits.push(edit(RenderTreeEditType.RemoveFrame, ctx.siblingIndex, -1, -1, null));
      break;
    case FrameType.Region: {
      const endIndexExcl = oldFrameIndex + getFrameSubtreeLength(oldFrame);
      let childIndex = oldFrameIndex + 1;
      while (childIndex < endIndexExcl) {
        removeOldFrame(ctx, childIndex);
        childIndex += getFrameSubtreeLength(oldTree[childIndex]!);
      }
      break;
    }
    case FrameType.Text:
    case FrameType.Markup:
      ctx.edits.push(edit(RenderTreeEditType.RemoveFrame, ctx.siblingIndex, -1, -1, null));
      break;
    case FrameType.ElementReferenceCapture:
    default:
      break;
  }
}

/** Queues every child component of a new subtree for instantiation (Blazor's InitializeNewSubtree). */
function initializeNewSubtree(ctx: DiffContext, frameIndex: number): void {
  const newTree = ctx.newTree;
  const endIndexExcl = frameIndex + getFrameSubtreeLength(newTree[frameIndex]!);
  for (let i = frameIndex; i < endIndexExcl; i++) {
    if (newTree[i]!.frameType === FrameType.Component) {
      ctx.components.push(-1, i);
    }
  }
}

/** Queues every child component of a removed subtree for disposal (Blazor's DisposeFramesInRange). */
function disposeFramesInRange(ctx: DiffContext, startIndex: number, endIndexExcl: number): void {
  const oldTree = ctx.oldTree;
  for (let i = startIndex; i < endIndexExcl; i++) {
    if (oldTree[i]!.frameType === FrameType.Component) {
      ctx.disposedComponents.push(i);
    }
  }
}

/** A StepOut right after a StepIn cancels it: unchanged elements emit nothing. */
function appendStepOut(ctx: DiffContext): void {
  const edits = ctx.edits;
  if (edits.length > 0 && edits[edits.length - 1]!.type === RenderTreeEditType.StepIn) {
    edits.pop();
  } else {
    edits.push(edit(RenderTreeEditType.StepOut, 0, -1, -1, null));
  }
}

/**
 * Attribute diff: merge join while sequence and name agree (the common case:
 * same attributes in the same order), otherwise a name-keyed join for the
 * rest. Blazor also merge-joins through added/removed sequences; that
 * mis-orders a name that moved to a lower sequence (set, then removed), so
 * any mismatch takes the keyed path here. The builder does not dedupe
 * attribute names like Blazor's does, so the last occurrence of a name wins.
 */
function appendAttributeDiffEntriesForRange(ctx: DiffContext, oldStartIndex: number, oldEndIndexExcl: number, newStartIndex: number, newEndIndexExcl: number): void {
  const oldTree = ctx.oldTree;
  const newTree = ctx.newTree;
  while (oldStartIndex < oldEndIndexExcl && newStartIndex < newEndIndexExcl) {
    const oldFrame = oldTree[oldStartIndex]!;
    const newFrame = newTree[newStartIndex]!;
    if (oldFrame.sequence !== newFrame.sequence || oldFrame.attributeName !== newFrame.attributeName) {
      appendAttributeDiffEntriesForRangeSlow(ctx, oldStartIndex, oldEndIndexExcl, newStartIndex, newEndIndexExcl);
      return;
    }
    if (!attributeValueSame(oldFrame, newFrame)) {
      ctx.edits.push(edit(RenderTreeEditType.SetAttribute, ctx.siblingIndex, newStartIndex, -1, null));
    }
    oldStartIndex++;
    newStartIndex++;
  }
  // One run is exhausted: the rest are plain removals or additions.
  for (; oldStartIndex < oldEndIndexExcl; oldStartIndex++) removeOldFrame(ctx, oldStartIndex);
  for (; newStartIndex < newEndIndexExcl; newStartIndex++) insertNewFrame(ctx, newStartIndex);
}

function appendAttributeDiffEntriesForRangeSlow(ctx: DiffContext, oldStartIndex: number, oldEndIndexExcl: number, newStartIndex: number, newEndIndexExcl: number): void {
  const oldTree = ctx.oldTree;
  const newTree = ctx.newTree;
  const newByName = new Map<string, number>();
  for (let i = newStartIndex; i < newEndIndexExcl; i++) newByName.set(newTree[i]!.attributeName!, i);
  const oldByName = new Map<string, number>();
  for (let i = oldStartIndex; i < oldEndIndexExcl; i++) oldByName.set(oldTree[i]!.attributeName!, i);

  for (const [name, oldIndex] of oldByName) {
    const newIndex = newByName.get(name);
    if (newIndex === undefined) {
      removeOldFrame(ctx, oldIndex);
    } else {
      if (!attributeValueSame(oldTree[oldIndex]!, newTree[newIndex]!)) {
        ctx.edits.push(edit(RenderTreeEditType.SetAttribute, ctx.siblingIndex, newIndex, -1, null));
      }
      newByName.delete(name);
    }
  }
  for (const newIndex of newByName.values()) {
    insertNewFrame(ctx, newIndex);
  }
}

/** Attribute value equality for diffing; EventCallbacks compare by receiver + delegate. */
export function attributeValueSame(oldFrame: RenderTreeFrame, newFrame: RenderTreeFrame): boolean {
  const oldValue = oldFrame.attributeValue;
  const newValue = newFrame.attributeValue;
  if (newValue instanceof EventCallback || oldValue instanceof EventCallback) {
    return oldValue instanceof EventCallback && newValue instanceof EventCallback && oldValue.equals(newValue as EventCallback<never>);
  }
  return oldValue === newValue;
}

/** End (exclusive) of the contiguous attribute run after an element/component start frame. */
export function attributesEndIndexExclusive(frames: RenderTreeFrame[], startIndex: number): number {
  const end = startIndex + getFrameSubtreeLength(frames[startIndex]!);
  let i = startIndex + 1;
  while (i < end && frames[i]!.frameType === FrameType.Attribute) i++;
  return i;
}

function edit(type: RenderTreeEditType, siblingIndex: number, referenceFrameIndex: number, moveToSiblingIndex: number, removedAttributeName: string | null): RenderTreeEdit {
  return { type, siblingIndex, referenceFrameIndex, moveToSiblingIndex, removedAttributeName };
}

function isAttribute(frame: RenderTreeFrame): boolean {
  return frame.frameType === FrameType.Attribute || frame.frameType === FrameType.EventHandler;
}

/** Element @key or component @key; null/undefined mean "not keyed". */
function keyValue(frame: RenderTreeFrame): Key | null {
  let key: Key | null | undefined = null;
  if (frame.frameType === FrameType.Element) key = frame.elementKey;
  else if (frame.frameType === FrameType.Component) key = frame.componentKey;
  return key ?? null;
}

/** Extracts attribute frames (name → index) for an element or component start frame. */
export function attributeMap(frames: RenderTreeFrame[], startIndex: number): Map<string, { index: number; frame: RenderTreeFrame }> {
  const result = new Map<string, { index: number; frame: RenderTreeFrame }>();
  const end = startIndex + getFrameSubtreeLength(frames[startIndex]!);
  for (let i = startIndex + 1; i < end; i++) {
    const frame = frames[i]!;
    if (frame.frameType === FrameType.Attribute) {
      result.set(frame.attributeName!, { index: i, frame });
    } else {
      break;
    }
  }
  return result;
}

/** Structural equality for parameter values (identity-based, like Blazor's fast path). */
export function attributeValueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // NaN-safe primitive comparison plus date-like structural check is out of
  // scope for v1; identity comparison matches Blazor's default behavior.
  return false;
}

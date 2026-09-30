import type { RenderTreeFrame } from "./render-tree.js";
import { getFrameChildren, getFrameSubtreeLength } from "./render-tree.js";
import { FrameType } from "./frame-type.js";

export interface FrameMatch {
  /** new frame index → matched old frame index */
  readonly matches: Map<number, number>;
  /** old frame indexes not matched, ascending */
  readonly removed: Array<number>;
}

/**
 * Matches the direct children of two corresponding frames.
 * Blazor's RenderTreeDiffComparer model: keys override sequences; sequences
 * match with occurrence index (loop iterations reuse the same sequence).
 * A parent index of -1 denotes the implicit root (the whole array).
 */
export function matchChildren(oldFrames: RenderTreeFrame[], oldParentIndex: number, newFrames: RenderTreeFrame[], newParentIndex: number): FrameMatch {
  let oldChildren: Array<{ index: number; frame: RenderTreeFrame }>;
  let newChildren: Array<{ index: number; frame: RenderTreeFrame }>;
  if (oldParentIndex < 0) {
    if (newParentIndex >= 0) {
      // The new subtree has no old counterpart (e.g. a fresh region): all inserts.
      return { matches: new Map(), removed: [] };
    }
    oldChildren = getFrameChildren(oldFrames, oldParentIndex);
    newChildren = getFrameChildren(newFrames, newParentIndex);
  } else {
    oldChildren = getFrameChildren(oldFrames, oldParentIndex);
    newChildren = getFrameChildren(newFrames, newParentIndex);
  }
  const matches = new Map<number, number>();
  const claimedOld = new Set<number>();
  const claimedNew = new Set<number>();

  // 1. Key matching for elements and components.
  const oldByKey = new Map<string | number, number>();
  for (const { index, frame } of oldChildren) {
    const key = getKey(frame);
    if (key !== null && key !== undefined && !oldByKey.has(key)) {
      oldByKey.set(key, index);
    }
  }
  for (const { index, frame } of newChildren) {
    const key = getKey(frame);
    if (key !== null && key !== undefined && oldByKey.has(key)) {
      const oldIndex = oldByKey.get(key)!;
      matches.set(index, oldIndex);
      claimedOld.add(oldIndex);
      claimedNew.add(index);
    }
  }

  // 2. Sequence matching, occurrence-indexed (loops share sequences per iteration).
  const oldBySequence = new Map<number, number[]>();
  for (const { index, frame } of oldChildren) {
    if (claimedOld.has(index)) continue;
    const list = oldBySequence.get(frame.sequence) ?? [];
    list.push(index);
    oldBySequence.set(frame.sequence, list);
  }
  const newBySequence = new Map<number, number[]>();
  for (const { index, frame } of newChildren) {
    if (claimedNew.has(index)) continue;
    const list = newBySequence.get(frame.sequence) ?? [];
    list.push(index);
    newBySequence.set(frame.sequence, list);
  }
  for (const [sequence, newIndexes] of newBySequence) {
    const oldIndexes = oldBySequence.get(sequence);
    if (!oldIndexes) continue;
    const count = Math.min(oldIndexes.length, newIndexes.length);
    for (let i = 0; i < count; i++) {
      const oldIndex = oldIndexes[i]!;
      const newIndex = newIndexes[i]!;
      matches.set(newIndex, oldIndex);
      claimedOld.add(oldIndex);
      claimedNew.add(newIndex);
    }
  }

  const removed = oldChildren.filter(({ index }) => !claimedOld.has(index)).map(({ index }) => index);
  return { matches, removed };
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

/** Element @key or component @key, when present. */
function getKey(frame: RenderTreeFrame): string | number | null | undefined {
  if (frame.frameType === FrameType.Element) return frame.elementKey;
  if (frame.frameType === FrameType.Component) return frame.componentKey;
  return null;
}
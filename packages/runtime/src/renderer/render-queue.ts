import type { ComponentState } from "./component-state.js";

/**
 * A Renderer's pending component renders, dequeued parent-first: lowest
 * depth in the component tree first, FIFO among equal depths. A component
 * that is dirty together with an ancestor thus renders after the ancestor's
 * render has set its parameters — once, not twice. A component is queued at
 * most once at a time (`ComponentState.renderQueued`).
 */
export class RenderQueue {
  /** Binary min-heap ordered by (depth, enqueue order). */
  private readonly heap: ComponentState[] = [];
  private nextOrder = 0;

  get size(): number {
    return this.heap.length;
  }

  /** Adds `state` unless it is already queued. */
  enqueue(state: ComponentState): void {
    if (state.renderQueued) return;
    state.renderQueued = true;
    state.renderQueueOrder = this.nextOrder++;
    const heap = this.heap;
    let index = heap.push(state) - 1;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (!this.before(state, heap[parentIndex]!)) break;
      heap[index] = heap[parentIndex]!;
      index = parentIndex;
    }
    heap[index] = state;
  }

  /** Removes and returns the shallowest (then oldest) queued component. */
  dequeue(): ComponentState | undefined {
    const heap = this.heap;
    if (heap.length === 0) return undefined;
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child = right < heap.length && this.before(heap[right]!, heap[left]!) ? right : left;
        if (!this.before(heap[child]!, last)) break;
        heap[index] = heap[child]!;
        index = child;
      }
      heap[index] = last;
    }
    top.renderQueued = false;
    if (heap.length === 0) this.nextOrder = 0;
    return top;
  }

  private before(a: ComponentState, b: ComponentState): boolean {
    return a.depth !== b.depth ? a.depth < b.depth : a.renderQueueOrder < b.renderQueueOrder;
  }
}

/**
 * Blazor's SynchronizationContext equivalent: serializes component work and
 * batches DOM patches into a single microtask cycle.
 */
export class Dispatcher {
  private queue: Array<() => void | Promise<void>> = [];
  private scheduled = false;
  private running = false;

  /** Enqueues work; runs after previously enqueued work on this dispatcher. */
  invoke<T>(work: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        try {
          resolve(work());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.flush();
    });
  }

  private flush(): void {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const work = this.queue.shift()!;
        work();
      }
    } finally {
      this.running = false;
    }
  }
}
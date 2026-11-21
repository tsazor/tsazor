/**
 * `disposeSignal` and `observe(source, onNext?)` (Tsazor extension): external
 * sources bound to the component lifetime — subscribe, re-render per
 * notification (coalesced through the render queue), unsubscribe on dispose.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComponentBase,
  ErrorBoundary,
  defineComponent,
  type RenderFragment,
  type RenderTreeBuilder,
  type ObserveSource,
  sequenced,
} from "../src/index";
import {
  Renderer,
} from "../src/internal";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** A Svelte/ticker-style store: subscribe(listener) → unsubscribe. */
class Store {
  value = 0;
  readonly listeners = new Set<(value?: number) => void>();
  subscribe(listener: (value?: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  set(value: number): void {
    this.value = value;
    for (const listener of [...this.listeners]) listener(value);
  }
}

/** Mounts `type` under a host that can remove it (`show = false`). */
async function mountRemovable(type: abstract new () => ComponentBase): Promise<{
  container: HTMLElement;
  renderer: Renderer;
  child: () => ComponentBase;
  remove: () => Promise<void>;
}> {
  class Host extends ComponentBase {
    show = true;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      if (this.show) {
        b.openComponent(0, defineComponent(type));
        b.closeComponent();
      }
    }
    hide(): void {
      this.show = false;
      this.stateHasChanged();
    }
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  const state = renderer.renderInContainer(Host, container);
  await renderer.waitUntilIdle();
  const childState = renderer.getComponentState(state.id + 1)!;
  return {
    container,
    renderer,
    child: () => childState.component,
    remove: async () => {
      (state.component as Host).hide();
      await renderer.waitUntilIdle();
    },
  };
}

describe("disposeSignal", () => {
  it("aborts when the component is disposed, before its own dispose runs", async () => {
    let seenInDispose: boolean | undefined;
    class Probe extends ComponentBase {
      signal!: AbortSignal;
      protected override onInitialized(): void {
        this.signal = this.disposeSignal;
      }
      dispose(): void {
        seenInDispose = this.disposeSignal.aborted;
      }
    }
    const { child, remove } = await mountRemovable(Probe);
    const probe = child() as Probe;
    expect(probe.signal.aborted).toBe(false);
    await remove();
    expect(probe.signal.aborted).toBe(true);
    expect(seenInDispose).toBe(true);
  });

  it("tears down listeners registered with { signal }", async () => {
    const target = new EventTarget();
    let hits = 0;
    class Probe extends ComponentBase {
      protected override onInitialized(): void {
        target.addEventListener("ping", () => hits++, { signal: this.disposeSignal });
      }
    }
    const { remove } = await mountRemovable(Probe);
    target.dispatchEvent(new Event("ping"));
    await remove();
    target.dispatchEvent(new Event("ping"));
    expect(hits).toBe(1);
  });

  it("is already aborted when first read after dispose", async () => {
    class Probe extends ComponentBase {}
    const { child, remove } = await mountRemovable(Probe);
    await remove();
    expect(child().disposeSignal.aborted).toBe(true);
  });
});

describe("observe", () => {
  it("re-renders on every notification and unsubscribes on dispose", async () => {
    const store = new Store();
    class Page extends ComponentBase {
      protected override onInitialized(): void {
        this.observe(store);
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, `n${store.value}`);
      }
    }
    const { container, renderer, remove } = await mountRemovable(Page);
    expect(container.textContent).toBe("n0");
    store.set(1);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("n1");
    await remove();
    expect(store.listeners.size).toBe(0);
  });

  it("coalesces a burst of notifications into one render", async () => {
    const store = new Store();
    let renders = 0;
    class Page extends ComponentBase {
      protected override onInitialized(): void {
        this.observe(store);
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        renders++;
        b.addContent(0, `n${store.value}`);
      }
    }
    const { container, renderer } = await mountRemovable(Page);
    const before = renders;
    store.set(1);
    store.set(2);
    store.set(3);
    await renderer.waitUntilIdle();
    expect(renders - before).toBe(1);
    expect(container.textContent).toBe("n3");
  });

  it("runs onNext before the render, with the notified value", async () => {
    const store = new Store();
    const order: string[] = [];
    class Page extends ComponentBase {
      last = -1;
      protected override onInitialized(): void {
        this.observe(store, (value) => {
          order.push(`next:${value}`);
          this.last = value!;
        });
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        order.push(`render:${this.last}`);
        b.addContent(0, `last${this.last}`);
      }
    }
    const { container, renderer } = await mountRemovable(Page);
    order.length = 0;
    store.set(4);
    await renderer.waitUntilIdle();
    expect(order).toEqual(["next:4", "render:4"]);
    expect(container.textContent).toBe("last4");
  });

  it("supports observers with { unsubscribe() } (RxJS / TC39 Observable shape)", async () => {
    const observers = new Set<{ next(value: string): void }>();
    let unsubscribed = 0;
    const observable = {
      subscribe(observer: { next(value: string): void }) {
        observers.add(observer);
        return { unsubscribe: () => { observers.delete(observer); unsubscribed++; } };
      },
    };
    class Page extends ComponentBase {
      text = "";
      protected override onInitialized(): void {
        this.observe(observable, (value) => { this.text = value; });
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, this.text);
      }
    }
    const { container, renderer, remove } = await mountRemovable(Page);
    for (const observer of observers) observer.next("hello");
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("hello");
    await remove();
    expect(unsubscribed).toBe(1);
    expect(observers.size).toBe(0);
  });

  it("supports an async subscribe (handshake promise) with Sleipnir-style handlers", async () => {
    let handlers: { onNext(value: number): void } | undefined;
    let unsubscribed = 0;
    const events = {
      subscribe(h: { onNext(value: number): void; onError?(error: Error): void }) {
        handlers = h;
        return Promise.resolve({ unsubscribe: async () => { unsubscribed++; } });
      },
    };
    class Page extends ComponentBase {
      price = 0;
      protected override onInitialized(): void {
        this.observe(events, (value) => { this.price = value; });
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, `$${this.price}`);
      }
    }
    const { container, renderer, remove } = await mountRemovable(Page);
    handlers!.onNext(42);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("$42");
    await remove();
    expect(unsubscribed).toBe(1);
  });

  it("unsubscribes an async subscription that resolves after dispose", async () => {
    let resolveHandshake!: (handle: { unsubscribe(): void }) => void;
    let unsubscribed = 0;
    let listener: ((value?: number) => void) | undefined;
    const events = {
      subscribe(l: (value?: number) => void) {
        listener = l;
        return new Promise<{ unsubscribe(): void }>((resolve) => { resolveHandshake = resolve; });
      },
    };
    let renders = 0;
    class Page extends ComponentBase {
      protected override onInitialized(): void {
        this.observe(events);
      }
      protected override buildRenderTree(): void {
        renders++;
      }
    }
    const { renderer, remove } = await mountRemovable(Page);
    await remove();
    resolveHandshake({ unsubscribe: () => unsubscribed++ });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unsubscribed).toBe(1);
    const before = renders;
    listener!(1);
    await renderer.waitUntilIdle();
    expect(renders).toBe(before);
  });

  it("supports the (signal, notify) escape hatch", async () => {
    vi.useFakeTimers();
    try {
      let ticks = 0;
      class Clock extends ComponentBase {
        protected override onInitialized(): void {
          this.observe((signal, notify) => {
            const id = setInterval(() => { ticks++; notify(); }, 1000);
            signal.addEventListener("abort", () => clearInterval(id));
          });
        }
        protected override buildRenderTree(b: RenderTreeBuilder): void {
          b.addContent(0, `t${ticks}`);
        }
      }
      const { container, renderer, remove } = await mountRemovable(Clock);
      await vi.advanceTimersByTimeAsync(2000);
      await renderer.waitUntilIdle();
      expect(container.textContent).toBe("t2");
      await remove();
      await vi.advanceTimersByTimeAsync(3000);
      expect(ticks).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the returned function stops observing early", async () => {
    const store = new Store();
    let renders = 0;
    class Page extends ComponentBase {
      stop!: () => void;
      protected override onInitialized(): void {
        this.stop = this.observe(store);
      }
      protected override buildRenderTree(): void {
        renders++;
      }
    }
    const { child, renderer } = await mountRemovable(Page);
    (child() as Page).stop();
    expect(store.listeners.size).toBe(0);
    const before = renders;
    store.set(1);
    await renderer.waitUntilIdle();
    expect(renders).toBe(before);
  });

  it("routes onNext errors through the lifecycle error path (ErrorBoundary)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new Store();
    class Page extends ComponentBase {
      protected override onInitialized(): void {
        this.observe(store, () => {
          throw new Error("bad tick");
        });
      }
    }
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, ErrorBoundary);
        const content: RenderFragment = (inner) => {
          inner.openComponent(0, defineComponent(Page));
          inner.closeComponent();
        };
        b.addAttribute(1, "childContent", content);
        b.addAttribute(2, "errorContent", (error: unknown) => ((inner: RenderTreeBuilder) => inner.addContent(0, `caught: ${(error as Error).message}`)) as RenderFragment);
        b.closeComponent();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    const errors: string[] = [];
    renderer.errorHandler = ({ phase }) => errors.push(phase);
    renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    store.set(1);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("caught: bad tick");
    expect(errors).toEqual([]);
    // The failed subtree is gone: its subscription with it.
    expect(store.listeners.size).toBe(0);
  });

  it("reports onNext errors with phase 'lifecycle' without a boundary", async () => {
    const store = new Store();
    class Page extends ComponentBase {
      protected override onInitialized(): void {
        this.observe(store, () => {
          throw new Error("bad tick");
        });
      }
    }
    const { renderer } = await mountRemovable(Page);
    const phases: string[] = [];
    renderer.errorHandler = ({ phase }) => phases.push(phase);
    store.set(1);
    await renderer.waitUntilIdle();
    expect(phases).toEqual(["lifecycle"]);
  });

  it("routes a source's error() and a rejected handshake as lifecycle errors; a throwing unsubscribe as a dispose error", async () => {
    let observer: { error(e: unknown): void } | undefined;
    class Page extends ComponentBase {
      protected override onInitialized(): void {
        this.observe({ subscribe: (o: { error(e: unknown): void }) => { observer = o; return () => { throw new Error("unsub"); }; } });
        this.observe({ subscribe: () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("handshake")), 5)) });
      }
    }
    const { renderer, remove } = await mountRemovable(Page);
    const seen: string[] = [];
    renderer.errorHandler = ({ error, phase }) => seen.push(`${phase}:${(error as Error).message}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    observer!.error(new Error("source"));
    await remove();
    expect(seen.sort()).toEqual(["dispose:unsub", "lifecycle:handshake", "lifecycle:source"]);
  });

  it("warns (dev) when observing after dispose and ignores the call", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new Store();
    class Page extends ComponentBase {
      later(): () => void {
        return this.observe(store);
      }
    }
    const { child, remove } = await mountRemovable(Page);
    await remove();
    const stop = (child() as Page).later();
    expect(store.listeners.size).toBe(0);
    expect(() => stop()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("observe() after dispose is ignored"));
  });

  it("warns (dev) when the same source is observed twice — and keeps both subscriptions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new Store();
    class Page extends ComponentBase {
      protected override onParametersSet(): void {
        this.observe(store);
      }
    }
    const { child, remove } = await mountRemovable(Page);
    (child() as unknown as { onParametersSet(): void }).onParametersSet();
    expect(store.listeners.size).toBe(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("the same source is observed twice"));
    await remove();
    expect(store.listeners.size).toBe(0);
  });

  it("type-checks the supported source shapes", () => {
    const shapes: ObserveSource<number>[] = [
      { subscribe: (listener: (value: number) => void) => () => void listener },
      { subscribe: (observer: { next(value: number): void }) => ({ unsubscribe: () => void observer }) },
      { subscribe: async (handlers: { onNext: (value: number) => void; onError?: (error: Error) => void }) => ({ unsubscribe: async () => void handlers }) },
      (signal: AbortSignal, notify: (value?: number) => void) => void [signal, notify],
    ];
    expect(shapes).toHaveLength(4);
  });
});

describe("dispatchExceptionAsync (Blazor parity)", () => {
  it("hands an error from outside the renderer to the nearest ErrorBoundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail: (error: unknown) => Promise<void> = async () => {};
    class Widget extends ComponentBase {
      protected override onInitialized(): void {
        // A callback the renderer doesn't see (a timer, a DOM listener of the component's own).
        fail = (error) => this.dispatchExceptionAsync(error);
      }
    }
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, ErrorBoundary);
        const content: RenderFragment = (inner) => {
          inner.openComponent(0, defineComponent(Widget));
          inner.closeComponent();
        };
        b.addAttribute(1, "childContent", content);
        b.addAttribute(2, "errorContent", (error: unknown) => ((inner: RenderTreeBuilder) => inner.addContent(0, `caught: ${(error as Error).message}`)) as RenderFragment);
        b.closeComponent();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    const errors: string[] = [];
    renderer.errorHandler = ({ phase }) => errors.push(phase);
    renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    await fail(new Error("closed too late"));
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("caught: closed too late");
    expect(errors).toEqual([]);
  });
});

/** A job's event stream: replays its history to each subscriber, then goes live; it can complete. */
class JobStream {
  readonly history: { seq: number; text: string }[] = [];
  readonly observers = new Set<{ next(event: { seq: number; text: string }): void; complete(): void }>();
  subscribe(observer: { next(event: { seq: number; text: string }): void; complete(): void }) {
    this.observers.add(observer);
    for (const event of this.history) observer.next(event);
    return () => this.observers.delete(observer);
  }
  emit(seq: number, text: string): void {
    this.history.push({ seq, text });
    for (const observer of this.observers) observer.next({ seq, text });
  }
  complete(): void {
    for (const observer of this.observers) observer.complete();
  }
}

describe("observe(source, { next, complete, error })", () => {
  it("runs complete when the source completes and renders; without it completion is ignored", async () => {
    const stream = new JobStream();
    class Page extends ComponentBase {
      text = "";
      state = "live";
      protected override onInitialized(): void {
        this.observe(stream, { next: (event) => { this.text += event.text; }, complete: () => { this.state = "done"; } });
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, `${this.state}:${this.text}`);
      }
    }
    const { container, renderer } = await mountRemovable(Page);
    stream.emit(1, "a");
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("live:a");
    stream.complete();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("done:a");
  });

  it("an async complete renders again when it's done (the final state loaded)", async () => {
    const stream = new JobStream();
    let resolveLoad: (value: string) => void = () => {};
    class Page extends ComponentBase {
      result = "";
      protected override onInitialized(): void {
        this.observe(stream, { complete: async () => { this.result = await new Promise<string>((resolve) => (resolveLoad = resolve)); } });
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, this.result || "running");
      }
    }
    const { container, renderer } = await mountRemovable(Page);
    stream.complete();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("running");
    resolveLoad("42 steps, OK");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("42 steps, OK");
  });

  it("an error handler takes the source's error instead of the error path", async () => {
    let fail: (error: unknown) => void = () => {};
    const source = { subscribe: (observer: { error(error: unknown): void }) => { fail = (error) => observer.error(error); } };
    class Page extends ComponentBase {
      message = "";
      protected override onInitialized(): void {
        this.observe(source, { error: (error) => { this.message = String(error); } });
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, this.message);
      }
    }
    const { container, renderer } = await mountRemovable(Page);
    fail("lost");
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("lost");
  });
});

describe("sequenced", () => {
  it("drops values whose number isn't above the last: a replay after a resubscribe reaches the page once", () => {
    const stream = new JobStream();
    const progress = sequenced(stream, (event) => event.seq);
    const seen: number[] = [];
    const listener = Object.assign(() => {}, {
      next: (event: { seq: number }) => void seen.push(event.seq),
      error: () => {},
      complete: () => {},
      onNext: () => {},
      onError: () => {},
      onComplete: () => {},
    });
    const first = progress.subscribe(listener as never) as () => void;
    stream.emit(1, "a");
    stream.emit(2, "b");
    first();
    stream.emit(3, "c");
    progress.subscribe(listener as never); // the reconnect: history 1, 2, 3 replayed
    stream.emit(2, "late duplicate");
    stream.emit(4, "d");
    expect(seen).toEqual([1, 2, 3, 4]);
    expect([progress.lastSequence, progress.completed]).toEqual([4, false]);
    stream.complete();
    expect(progress.completed).toBe(true);
  });

  it("starts after a number the page already has", () => {
    const stream = new JobStream();
    stream.emit(1, "a");
    stream.emit(2, "b");
    const seen: number[] = [];
    sequenced(stream, (event) => event.seq, 1).subscribe(Object.assign(() => {}, { next: (event: { seq: number }) => void seen.push(event.seq), error() {}, complete() {}, onNext() {}, onError() {}, onComplete() {} }) as never);
    expect(seen).toEqual([2]);
  });
});

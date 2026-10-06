/**
 * `<Await>` (Tsazor extension, Svelte's `{#await}`): Pending while the
 * promise is pending, Then with the value, Catch with the reason; latest
 * promise wins; no render after dispose; a rejection without Catch fails the
 * component (ErrorBoundary).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Await, ComponentBase, ErrorBoundary, Renderer, type RenderFragment, type RenderTreeBuilder } from "../src/index";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** A promise with its resolve/reject handles. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const text = (value: string): RenderFragment => (b) => b.addContent(0, value);

interface Slots {
  pending?: boolean;
  then?: boolean;
  catch?: boolean;
}

/** Mounts a host rendering `<Await For=…>` (or nothing when `show` is false). */
async function mountAwait(initial: unknown, slots: Slots = { pending: true, then: true, catch: true }, renderer = new Renderer()) {
  let renders = 0;
  class Host extends ComponentBase {
    source: unknown = initial;
    show = true;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      if (!this.show) return;
      b.openComponent(0, Await);
      b.addAttribute(1, "for", this.source);
      if (slots.pending) b.addAttribute(2, "pending", text("loading"));
      if (slots.then)
        b.addAttribute(3, "then", (value: unknown) => {
          renders++;
          return text(`value: ${String(value)}`);
        });
      if (slots.catch) b.addAttribute(4, "catch", (error: unknown) => text(`error: ${(error as Error).message}`));
      b.closeComponent();
    }
    async update(next: Partial<Pick<Host, "source" | "show">>): Promise<void> {
      Object.assign(this, next);
      this.stateHasChanged();
      await tick();
    }
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = renderer.renderInContainer(Host, container);
  // Not waitUntilIdle: the pending promise counts for it.
  await tick();
  return { container, renderer, host: state.component as Host, thenRenders: () => renders };
}

/** Lets the render batch run (a pending promise keeps waitUntilIdle waiting). */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const flush = async (renderer: Renderer): Promise<void> => {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
};

describe("Await", () => {
  it("renders Pending, then Then with the resolved value", async () => {
    const d = deferred<number>();
    const m = await mountAwait(d.promise);
    expect(m.container.textContent).toBe("loading");
    d.resolve(42);
    await flush(m.renderer);
    expect(m.container.textContent).toBe("value: 42");
  });

  it("renders Pending, then Catch with the rejection reason (no component failure)", async () => {
    const errors: unknown[] = [];
    const renderer = new Renderer();
    renderer.errorHandler = ({ error }) => errors.push(error);
    const d = deferred<number>();
    const m = await mountAwait(d.promise, undefined, renderer);
    d.reject(new Error("offline"));
    await flush(m.renderer);
    expect(m.container.textContent).toBe("error: offline");
    expect(errors).toEqual([]);
  });

  it("a new promise resets to Pending; the same promise on a re-render changes nothing", async () => {
    const first = Promise.resolve(1);
    const m = await mountAwait(first);
    await flush(m.renderer);
    expect(m.container.textContent).toBe("value: 1");
    await m.host.update({ source: first });
    expect(m.container.textContent).toBe("value: 1");
    const second = deferred<number>();
    await m.host.update({ source: second.promise });
    expect(m.container.textContent).toBe("loading");
    second.resolve(2);
    await flush(m.renderer);
    expect(m.container.textContent).toBe("value: 2");
  });

  it("ignores a stale promise that settles after it was replaced (latest wins)", async () => {
    const stale = deferred<string>();
    const latest = deferred<string>();
    const m = await mountAwait(stale.promise);
    await m.host.update({ source: latest.promise });
    latest.resolve("new");
    await flush(m.renderer);
    expect(m.container.textContent).toBe("value: new");
    stale.resolve("old");
    await flush(m.renderer);
    expect(m.container.textContent).toBe("value: new");
    // A stale rejection is ignored too (no Catch, no failure).
    const again = deferred<string>();
    await m.host.update({ source: again.promise });
    await m.host.update({ source: latest.promise });
    again.reject(new Error("late"));
    await flush(m.renderer);
    expect(m.container.textContent).toBe("value: new");
  });

  it("treats a value that is no promise as resolved, and null/undefined as pending", async () => {
    const m = await mountAwait("plain");
    expect(m.container.textContent).toBe("value: plain");
    await m.host.update({ source: undefined });
    expect(m.container.textContent).toBe("loading");
    await m.host.update({ source: 0 });
    expect(m.container.textContent).toBe("value: 0");
  });

  it("renders a promise it already saw settle without a Pending pass", async () => {
    const done = Promise.resolve("cached");
    const m = await mountAwait(done);
    await flush(m.renderer);
    await m.host.update({ show: false });
    await m.host.update({ show: true });
    // A fresh Await instance: the settlement is known, Then renders at once.
    expect(m.container.textContent).toBe("value: cached");
  });

  it("missing fragments render nothing", async () => {
    const d = deferred<number>();
    const m = await mountAwait(d.promise, { then: true });
    expect(m.container.textContent).toBe("");
    d.resolve(7);
    await flush(m.renderer);
    expect(m.container.textContent).toBe("value: 7");
  });

  it("ignores a settlement after the component was disposed (no render)", async () => {
    const d = deferred<number>();
    const m = await mountAwait(d.promise);
    await m.host.update({ show: false });
    expect(m.container.textContent).toBe("");
    d.resolve(1);
    await flush(m.renderer);
    expect(m.container.textContent).toBe("");
    expect(m.thenRenders()).toBe(0);
  });

  it("counts the pending promise for waitUntilIdle", async () => {
    const m = await mountAwait(new Promise((resolve) => setTimeout(() => resolve("later"), 10)));
    await m.renderer.waitUntilIdle();
    expect(m.container.textContent).toBe("value: later");
  });

  it("is never a thenable: the parameters are write-only", async () => {
    let instance: Await | undefined;
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, Await);
        b.addAttribute(1, "for", 1);
        b.addAttribute(2, "then", () => text("x"));
        b.addComponentReferenceCapture(3, (component) => (instance = component as Await));
        b.closeComponent();
      }
    }
    const renderer = new Renderer();
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("x");
    expect(typeof (instance as unknown as { then?: unknown }).then).toBe("undefined");
    expect(await Promise.resolve(instance)).toBe(instance);
  });

  it("without Catch, a rejection fails the component: the nearest ErrorBoundary shows it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deferred<number>();
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, ErrorBoundary);
        const content: RenderFragment = (inner) => {
          inner.openComponent(0, Await);
          inner.addAttribute(1, "for", d.promise);
          inner.addAttribute(2, "then", (value: unknown) => text(`value: ${String(value)}`));
          inner.closeComponent();
        };
        b.addAttribute(1, "childContent", content);
        b.addAttribute(2, "errorContent", (error: unknown) => text(`caught: ${(error as Error).message}`));
        b.closeComponent();
      }
    }
    const renderer = new Renderer();
    const phases: string[] = [];
    renderer.errorHandler = ({ phase }) => phases.push(phase);
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderer.renderInContainer(Host, container);
    await tick();
    d.reject(new Error("boom"));
    await flush(renderer);
    expect(container.textContent).toBe("caught: boom");
    expect(phases).toEqual([]);
  });

  it("without Catch and without a boundary, a rejection reaches the error handler (phase 'lifecycle')", async () => {
    const renderer = new Renderer();
    const failures: Array<{ phase: string; message: string }> = [];
    renderer.errorHandler = ({ phase, error }) => failures.push({ phase, message: (error as Error).message });
    const m = await mountAwait(Promise.reject(new Error("unhandled")), { then: true }, renderer);
    await flush(m.renderer);
    expect(failures).toEqual([{ phase: "lifecycle", message: "unhandled" }]);
  });
});

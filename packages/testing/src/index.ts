import { ComponentBase, Renderer, ServiceCollection, type RenderTreeBuilder } from "@tsazor/runtime";

/**
 * Blazor's Bunit-style render helper: mounts a component into a detached
 * happy-dom document and returns the container plus the live instance.
 */
export interface RenderResult<TComponent extends ComponentBase = ComponentBase> {
  /** The DOM output container (attached to document.body). */
  container: HTMLElement;
  renderer: Renderer;
  /** The root component instance. */
  instance: TComponent;
  /** Queues a re-render of the root component and waits for it to flush. */
  rerender(): Promise<void>;
  /** Removes the component and clears the container. */
  dispose(): void;
}

export interface RenderOptions {
  /** DI registrations applied before the component instantiates. */
  services?: (services: ServiceCollection) => void;
}

/** Mounts `component` (a class) and awaits the first render + async hooks. */
export async function render<TComponent extends ComponentBase>(
  component: abstract new (...args: never[]) => TComponent,
  options?: RenderOptions,
): Promise<RenderResult<TComponent>> {
  const collection = new ServiceCollection();
  options?.services?.(collection);
  const renderer = new Renderer(collection.build());
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = renderer.renderInContainer(component, container);
  await renderer.waitUntilIdle();

  return {
    container,
    renderer,
    instance: state.component as TComponent,
    rerender: async () => {
      (state.component as ComponentBase).stateHasChangedInternal();
      await renderer.waitUntilIdle();
    },
    dispose: () => {
      renderer.disposeComponent(state);
      container.remove();
    },
  };
}

/**
 * Builds a small test component in place — handy for builder-API checks
 * without writing a whole class.
 */
export function renderTree(build: (b: RenderTreeBuilder) => void): Promise<RenderResult> {
  class TestComponent extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      build(b);
    }
  }
  return render(TestComponent);
}

/**
 * A fake external store for components that `track` it: the shape of a
 * Svelte-style store (`subscribe(listener) → unsubscribe`). `set` notifies
 * every listener synchronously; `listenerCount` shows whether a component
 * still listens (0 after it was disposed).
 */
export interface FakeStore<T> {
  readonly value: T;
  readonly listenerCount: number;
  /** Sets the value and notifies every listener with it. */
  set(value: T): void;
  /** Notifies every listener again with the current value (an in-place mutation). */
  notify(): void;
  subscribe(listener: (value: T) => void): () => void;
}

export function createFakeStore<T>(initial: T): FakeStore<T> {
  const listeners = new Set<(value: T) => void>();
  let value = initial;
  const notify = (): void => {
    for (const listener of [...listeners]) listener(value);
  };
  return {
    get value() {
      return value;
    },
    get listenerCount() {
      return listeners.size;
    },
    set(next: T) {
      value = next;
      notify();
    },
    notify,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export * from "@tsazor/runtime";
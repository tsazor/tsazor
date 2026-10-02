import {
  ComponentBase,
  CultureService,
  Renderer,
  ServiceCollection,
  StringLocalizer,
  type RenderTreeBuilder,
  type StringTable,
  type Token,
} from "@tsazor/runtime";

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
 * A fake external store for components that `observe` it: the shape of a
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

/**
 * A localization fixture for components that inject `CultureService` or
 * `StringLocalizer`: real services over the given tables (nothing about them
 * needs faking — the fake is the one-line registration and the culture switch).
 * `register` wires both under their app tokens into a `render`-style services
 * callback; `switchTo` is an explicit culture change (it notifies, so injected
 * components re-render — the E8 auto-render extension). For the profile/lock
 * semantics call the `culture` service directly.
 */
export interface FakeLocalization {
  readonly culture: CultureService;
  readonly localizer: StringLocalizer;
  /** Registers both under their app tokens — `render(C, { services: (s) => fake.register(s) })`. */
  register(services: ServiceCollection): void;
  /** Switches the current culture (explicit: wins, locks, notifies). */
  switchTo(culture: string): void;
}

/** The fake localization fixture's tables: culture → key → message. */
export interface FakeLocalizationOptions {
  tables?: Readonly<Record<string, StringTable>>;
  defaultCulture?: string;
}

export function createFakeLocalization(options: FakeLocalizationOptions = {}): FakeLocalization {
  const culture = new CultureService(options.defaultCulture ?? "");
  const localizer = new StringLocalizer({
    culture,
    tables: options.tables as Record<string, StringTable> | undefined,
    defaultCulture: options.defaultCulture,
  });
  return {
    culture,
    localizer,
    register(services) {
      services.registerValue(CultureService as unknown as Token<CultureService>, culture);
      services.register(StringLocalizer as unknown as Token<StringLocalizer>, () => localizer);
    },
    switchTo(name) {
      culture.setExplicit(name);
    },
  };
}

export * from "@tsazor/runtime";
import {
  ComponentBase,
  CultureService,
  defineComponent,
  Renderer,
  ServiceCollection,
  StringLocalizer,
  type AttributeValue,
  type ComponentType,
  type RenderTreeBuilder,
  type StringTable,
  type Token,
} from "@tsazor/runtime";

/**
 * The parameters a test may pass to a component: its own fields (typed), or —
 * when only the generic component type is known (a `.tsazor` import outside
 * the type-checked shadow) — any name.
 */
export type ParametersOf<TComponent extends ComponentBase> = ComponentBase extends TComponent
  ? Record<string, unknown>
  : Partial<Omit<TComponent, keyof ComponentBase>>;

/**
 * How long the helpers wait for the renderer to be idle: under vitest's 5 s test timeout, so a test
 * that waits on a handler it never lets finish fails naming the handler instead of hanging.
 */
const IDLE_TIMEOUT = 4_000;

/**
 * Blazor's bUnit-style render result: the rendered component in a container
 * attached to the document, its live instance, and helpers that act like a
 * user and wait for the render (bUnit's Find / Click / Change / SetParametersAndRender).
 */
export interface RenderResult<TComponent extends ComponentBase = ComponentBase> {
  /** The DOM output container (attached to document.body). */
  container: HTMLElement;
  /** The renderer that hosts the component, with the services from `RenderOptions.services`. */
  renderer: Renderer;
  /** The component instance. */
  instance: TComponent;
  /** The rendered HTML, without the renderer's boundary comments. */
  readonly markup: string;
  /** The first element matching `selector`; throws when there is none (bUnit's Find). */
  find(selector: string): HTMLElement;
  /** Every element matching `selector`. */
  findAll(selector: string): HTMLElement[];
  /** Clicks the element and waits until the component has rendered (async handlers included). */
  click(selector: string): Promise<void>;
  /** Sets an input's value, raises `change` (what `@bind` listens to) and waits for the render. */
  change(selector: string, value: string): Promise<void>;
  /** Passes new parameter values (merged with the earlier ones) and waits for the render. */
  setParameters(parameters: ParametersOf<TComponent>): Promise<void>;
  /** Waits until pending renders and async work (handlers, lifecycle methods) are done. */
  settle(): Promise<void>;
  /** Queues a re-render of the component and waits for it to flush. */
  rerender(): Promise<void>;
  /** Removes the component and clears the container. */
  dispose(): void;
}

/** Options for `render`: the component's parameters and the DI registrations. */
export interface RenderOptions<TComponent extends ComponentBase = ComponentBase> {
  /** Parameter values, as a parent's attributes would pass them. */
  parameters?: ParametersOf<TComponent>;
  /** DI registrations applied before the component instantiates. */
  services?: (services: ServiceCollection) => void;
}

/**
 * Mounts `component` with its parameters and awaits the first render and
 * async lifecycle methods. Accepts a component class or a `.tsazor` import.
 * A failure of the component (a missing service, an exception in a lifecycle
 * method or an event handler) rejects the call that waited for it.
 */
export async function render<TComponent extends ComponentBase>(
  component: ComponentType<TComponent> | (abstract new (...args: never[]) => TComponent),
  options?: RenderOptions<TComponent>,
): Promise<RenderResult<TComponent>> {
  const collection = new ServiceCollection();
  options?.services?.(collection);
  const renderer = new Renderer(collection.build());
  // A component's failure (render, lifecycle, event handler) fails the test
  // at the next wait, as bUnit throws it — instead of only being logged.
  const failures: unknown[] = [];
  renderer.errorHandler = ({ error }) => {
    failures.push(error);
  };
  const rethrow = (): void => {
    if (failures.length === 0) return;
    const [first] = failures.splice(0);
    throw first;
  };
  const container = document.createElement("div");
  document.body.appendChild(container);

  // A host passes the parameters the way a parent component would.
  let parameters: Record<string, unknown> = { ...options?.parameters };
  let instance: TComponent | undefined;
  const target = (typeof component === "function" ? defineComponent(component) : component) as ComponentType;
  class TestHost extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openComponent(0, target);
      let sequence = 1;
      for (const [name, value] of Object.entries(parameters)) b.addAttribute(sequence++, name, value as AttributeValue);
      b.addComponentReferenceCapture(sequence, (captured) => {
        instance = captured as TComponent;
      });
      b.closeComponent();
    }
  }
  const host = renderer.renderInContainer(TestHost, container);
  await renderer.waitUntilIdle({ timeout: IDLE_TIMEOUT });
  rethrow();

  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await renderer.waitUntilIdle({ timeout: IDLE_TIMEOUT });
    rethrow();
  };
  const find = (selector: string): HTMLElement => {
    const element = container.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`No element matches '${selector}'. The markup is:\n${result.markup}`);
    return element;
  };
  const result: RenderResult<TComponent> = {
    container,
    renderer,
    get instance() {
      return instance!;
    },
    get markup() {
      return container.innerHTML.replace(/<!--\/?bl-tsazor:[^>]*-->/g, "");
    },
    find,
    findAll: (selector) => [...container.querySelectorAll<HTMLElement>(selector)],
    click: async (selector) => {
      find(selector).click();
      await settle();
    },
    change: async (selector, value) => {
      const element = find(selector) as HTMLInputElement;
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();
    },
    setParameters: async (next) => {
      parameters = { ...parameters, ...next };
      (host.component as ComponentBase).stateHasChangedInternal();
      await settle();
    },
    settle,
    rerender: async () => {
      instance!.stateHasChangedInternal();
      await renderer.waitUntilIdle({ timeout: IDLE_TIMEOUT });
      rethrow();
    },
    dispose: () => {
      renderer.disposeComponent(host);
      container.remove();
    },
  };
  return result;
}

/**
 * Builds a small test component in place — handy for builder-API checks
 * without writing a whole class. `options.services` registers services, as
 * for `render`.
 */
export function renderTree(build: (b: RenderTreeBuilder) => void, options?: Pick<RenderOptions, "services">): Promise<RenderResult> {
  class TestComponent extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      build(b);
    }
  }
  return render<ComponentBase>(TestComponent, options);
}

/**
 * A fake external store for components that `observe` it: the shape of a
 * Svelte-style store (`subscribe(listener) → unsubscribe`). `set` notifies
 * every listener synchronously; `listenerCount` shows whether a component
 * still listens (0 after it was disposed).
 */
export interface FakeStore<T> {
  /** The current value. */
  readonly value: T;
  /** How many listeners are subscribed right now. */
  readonly listenerCount: number;
  /** Sets the value and notifies every listener with it. */
  set(value: T): void;
  /** Notifies every listener again with the current value (an in-place mutation). */
  notify(): void;
  /** Adds a listener (not called on subscribe, only on `set`/`notify`); returns the unsubscribe function. */
  subscribe(listener: (value: T) => void): () => void;
}

/** Creates a `FakeStore` holding `initial`. */
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
  /** The culture service, starting at `defaultCulture` (invariant without one). */
  readonly culture: CultureService;
  /** The localizer over the given tables, following `culture`. */
  readonly localizer: StringLocalizer;
  /** Registers both under their app tokens — `render(C, { services: (s) => fake.register(s) })`. */
  register(services: ServiceCollection): void;
  /** Switches the current culture (explicit: wins, locks, notifies). */
  switchTo(culture: string): void;
}

/** The fake localization fixture's tables: culture → key → message. */
export interface FakeLocalizationOptions {
  /** Culture → key → message, as `StringLocalizerOptions.tables`; default none (`get` returns the key). */
  tables?: Readonly<Record<string, StringTable>>;
  /** The starting and fallback culture; required when `tables` has entries. */
  defaultCulture?: string;
}

/** Creates a `FakeLocalization` with a fresh `CultureService` and `StringLocalizer`. */
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
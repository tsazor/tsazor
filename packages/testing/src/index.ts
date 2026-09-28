import { ComponentBase, Renderer, ServiceCollection, type RenderTreeBuilder } from "@tasor/runtime";

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

export * from "@tasor/runtime";
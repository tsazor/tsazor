/**
 * Runtime conformance host: a root component whose render tree is a plain
 * function, so each test builds exactly the frames it needs — independent of
 * the compiler.
 */
import { ComponentBase, Parameter, Renderer, type RenderTreeBuilder } from "@tsazor/runtime";
import { rethrowEscapedRenderErrors } from "../harness.js";

export type Build = (b: RenderTreeBuilder) => void;

class Host extends ComponentBase {
  build: Build = () => {};
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.build(b);
  }
  rerender(): void {
    this.stateHasChanged();
  }
}

export interface HostHandle {
  container: HTMLElement;
  renderer: Renderer;
  /** Re-renders the host, optionally with a new build function, and settles. */
  update(build?: Build): Promise<void>;
  settle(): Promise<void>;
  text(): string;
}

export async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
  rethrowEscapedRenderErrors();
}

export async function host(build: Build): Promise<HostHandle> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  const state = renderer.renderInContainer(Host, container);
  const component = state.component as Host;
  component.build = build;
  component.rerender();
  await settle(renderer);
  return {
    container,
    renderer,
    async update(next?: Build) {
      if (next) component.build = next;
      component.rerender();
      await settle(renderer);
    },
    settle: () => settle(renderer),
    text: () => container.textContent ?? "",
  };
}

/** Shared lifecycle log for probe components. */
export const log: string[] = [];

/** Child that logs its lifecycle and renders <i>label</i>. */
export class Probe extends ComponentBase {
  label = "";
  protected override onInitialized(): void {
    log.push(`init:${this.label}`);
  }
  protected override onParametersSet(): void {
    log.push(`pset:${this.label}`);
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    log.push(`render:${this.label}`);
    b.openElement(0, "i");
    b.addContent(1, this.label);
    b.closeElement();
  }
  dispose(): void {
    log.push(`dispose:${this.label}`);
  }
}
Parameter()(Probe.prototype, "label");

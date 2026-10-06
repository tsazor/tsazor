/**
 * `@State()` (Tsazor extension, F6): assigning an auto-accessor field
 * schedules a render of its component — shallow, coalesced, quiet before
 * the first render and while the component builds its render tree.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, Renderer, State, type RenderTreeBuilder } from "../src/index";

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount<T extends ComponentBase>(type: new () => T): Promise<{ component: T; container: HTMLElement; renderer: Renderer }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  const state = renderer.renderInContainer(type, container);
  await renderer.waitUntilIdle();
  return { component: state.component as T, container, renderer };
}

class Clock extends ComponentBase {
  @State() accessor seconds = 0;
  @State() accessor items: string[] = [];
  renders = 0;

  override onInitialized(): void {
    // Before the first render: no extra render.
    this.seconds = 1;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.renders++;
    b.openElement(0, "p");
    b.addContent(1, `${this.seconds}s ${this.items.join(",")}`);
    b.closeElement();
  }
}

describe("@State (F6)", () => {
  it("renders the component after an assignment outside any handler", async () => {
    const { component, container, renderer } = await mount(Clock);
    expect(container.textContent).toBe("1s ");
    expect(component.renders).toBe(1);
    component.seconds = 2;
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("2s ");
    expect(component.renders).toBe(2);
  });

  it("coalesces assignments in a row into one render and ignores equal values", async () => {
    const { component, renderer } = await mount(Clock);
    component.seconds = 5;
    component.seconds = 6;
    component.seconds = 7;
    await renderer.waitUntilIdle();
    expect(component.renders).toBe(2);
    component.seconds = 7;
    await renderer.waitUntilIdle();
    expect(component.renders).toBe(2);
  });

  it("is shallow: a mutation is not seen, a new array is", async () => {
    const { component, container, renderer } = await mount(Clock);
    component.items.push("a");
    await renderer.waitUntilIdle();
    expect(component.renders).toBe(1);
    component.items = [...component.items, "b"];
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("1s a,b");
  });

  it("schedules nothing for an assignment while the component builds its render tree", async () => {
    class Counting extends ComponentBase {
      @State() accessor builds = 0;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        this.builds++;
        b.addContent(0, String(this.builds));
      }
    }
    const { component, renderer } = await mount(Counting);
    (component as unknown as { stateHasChangedInternal(): void }).stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(component.builds).toBe(2);
  });

  it("needs an auto-accessor", () => {
    const decorate = State<ComponentBase, number>();
    expect(() => decorate(undefined as never, { kind: "field", name: "count" } as never)).toThrow(/write 'accessor count'/);
  });
});

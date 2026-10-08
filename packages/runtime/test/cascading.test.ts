/**
 * B5: cascading values — name/type matching (Blazor's CanSupplyValue) and
 * subscriptions: suppliers notify their consumers directly, independent of
 * intermediate re-renders; IsFixed skips the subscription; disposal
 * unsubscribes.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CascadingParameter,
  CascadingValue,
  ComponentBase,
  Parameter,
  Renderer,
  defineComponent,
  type ComponentState,
  type RenderFragment,
  type RenderTreeBuilder,
} from "../src/index";

class Box {
  constructor(readonly n: number) {}
}
class SubBox extends Box {}

const log: string[] = [];

/** Renders its child content once, then never again (ShouldRender=false). */
class Wall extends ComponentBase {
  @Parameter() childContent?: RenderFragment;
  protected override shouldRender(): boolean {
    return false;
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.childContent?.(b);
  }
}

class NamedConsumer extends ComponentBase {
  @CascadingParameter({ name: "Theme" }) theme?: string;
  @Parameter() label = "";
  protected override onParametersSet(): void {
    log.push(`pset:${this.label}:${this.theme}`);
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, `${this.label}${this.theme ?? "none"}`);
  }
}

class BoxConsumer extends ComponentBase {
  @CascadingParameter({ type: Box }) box?: Box;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, this.box === undefined ? "none" : String(this.box.n));
  }
}

class Root extends ComponentBase {
  build: (b: RenderTreeBuilder) => void = () => {};
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.build(b);
  }
  rerender(): void {
    this.stateHasChanged();
  }
}

async function mount(build: (b: RenderTreeBuilder) => void) {
  const container = document.createElement("div");
  const renderer = new Renderer();
  renderer.errorHandler = ({ error }) => {
    throw error;
  };
  const state = renderer.renderInContainer(Root, container);
  const root = state.component as Root;
  root.build = build;
  root.rerender();
  await renderer.waitUntilIdle();
  return {
    container,
    renderer,
    root: state,
    async update() {
      root.rerender();
      await renderer.waitUntilIdle();
    },
  };
}

function cascade(b: RenderTreeBuilder, attributes: Record<string, unknown>, content: RenderFragment): void {
  b.openComponent(0, defineComponent(CascadingValue));
  let seq = 1;
  for (const [name, value] of Object.entries(attributes)) b.addAttribute(seq++, name, value as never);
  b.addAttribute(10, "ChildContent", content);
  b.closeComponent();
}

function walled(content: RenderFragment): RenderFragment {
  return (b) => {
    b.openComponent(0, defineComponent(Wall));
    b.addAttribute(1, "ChildContent", content);
    b.closeComponent();
  };
}

function component(type: abstract new () => ComponentBase, attributes: Record<string, unknown> = {}): RenderFragment {
  return (b) => {
    b.openComponent(0, defineComponent(type as never));
    let seq = 1;
    for (const [name, value] of Object.entries(attributes)) b.addAttribute(seq++, name, value as never);
    b.closeComponent();
  };
}

/** All live component states below `state` (depth-first). */
function descendants(state: ComponentState): ComponentState[] {
  const result: ComponentState[] = [];
  for (const child of state.slotChildren.values()) result.push(child, ...descendants(child));
  return result;
}

describe("by type, a plain object (API data) never matches", () => {
  it("warns once in dev, naming the parameter and the way out; an instance doesn't warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      // Parsed JSON: shaped like a Box, but not one.
      const plain = await mount((b) => cascade(b, { Value: { n: 7 } }, component(BoxConsumer)));
      expect(plain.container.textContent).toBe("none");
      await plain.update();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toMatch(/^\[tsazor\] BoxConsumer\.box: @CascadingParameter\(\{ type: Box \}\) found no Box, but passed a cascade whose value is a plain object\..*Cascade it by name/);
      warn.mockClear();
      const instance = await mount((b) => cascade(b, { Value: new Box(3) }, component(BoxConsumer)));
      expect(instance.container.textContent).toBe("3");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("B5 — matching", () => {
  it("Name matches CascadingParameter({ name }) case-insensitively", async () => {
    const h = await mount((b) => cascade(b, { Name: "theme", Value: "dark" }, component(NamedConsumer)));
    expect(h.container.textContent).toBe("dark");
  });

  it("a named supplier does not match a by-type parameter, an unnamed one does (Blazor's CanSupplyValue)", async () => {
    const h = await mount((b) =>
      cascade(b, { Value: new Box(1) }, (inner) => cascade(inner, { Name: "Other", Value: new Box(2) }, component(BoxConsumer))),
    );
    expect(h.container.textContent).toBe("1");
  });

  it("by-type matches subclasses; the nearest matching supplier wins", async () => {
    const h = await mount((b) =>
      cascade(b, { Value: new Box(1) }, (inner) => cascade(inner, { Value: new SubBox(2) }, component(BoxConsumer))),
    );
    expect(h.container.textContent).toBe("2");
  });

  it("a named parameter without a matching supplier stays unset", async () => {
    const h = await mount((b) => cascade(b, { Name: "Other", Value: "x" }, component(NamedConsumer)));
    expect(h.container.textContent).toBe("none");
  });
});

describe("B5 — subscriptions", () => {
  it("a value change reaches the consumer through an intermediate ShouldRender=false component", async () => {
    let theme = "dark";
    const h = await mount((b) => cascade(b, { Name: "Theme", Value: theme }, walled(component(NamedConsumer, { label: "c:" }))));
    expect(h.container.textContent).toBe("c:dark");
    log.length = 0;
    theme = "light";
    await h.update();
    expect(h.container.textContent).toBe("c:light");
    // Re-set with the consumer's last direct parameters plus the new cascade.
    expect(log).toEqual(["pset:c::light"]);
  });

  it("an unchanged primitive value does not notify", async () => {
    const h = await mount((b) => cascade(b, { Name: "Theme", Value: "dark" }, walled(component(NamedConsumer, { label: "c:" }))));
    log.length = 0;
    await h.update();
    expect(log).toEqual([]);
  });

  it("an object value notifies on every supplier render (it may have been mutated)", async () => {
    const box = new Box(1);
    const h = await mount((b) => cascade(b, { Value: box }, walled(component(BoxConsumer))));
    (box as { n: number }).n = 5;
    await h.update();
    expect(h.container.textContent).toBe("5");
  });

  it("a by-type consumer below a supplier without a value yet picks the value up once set", async () => {
    let value: Box | undefined;
    const h = await mount((b) => cascade(b, { Value: value }, walled(component(BoxConsumer))));
    expect(h.container.textContent).toBe("none");
    value = new Box(3);
    await h.update();
    expect(h.container.textContent).toBe("3");
  });

  it("IsFixed: consumers do not subscribe", async () => {
    let theme = "dark";
    const h = await mount((b) => cascade(b, { Name: "Theme", Value: theme, IsFixed: true }, walled(component(NamedConsumer))));
    const supplier = [...h.root.slotChildren.values()][0]!;
    expect(supplier.subscribers?.size ?? 0).toBe(0);
    theme = "light";
    await h.update();
    expect(h.container.textContent).toBe("dark");
  });

  it("IsFixed cannot change after the first set (Blazor throws)", async () => {
    let fixed = true;
    const errors: unknown[] = [];
    const h = await mount((b) => cascade(b, { Name: "Theme", Value: "x", IsFixed: fixed }, component(NamedConsumer)));
    h.renderer.errorHandler = ({ error }) => errors.push(error);
    fixed = false;
    await h.update();
    expect(String(errors[0])).toMatch(/IsFixed cannot be changed dynamically/);
  });

  it("disposal unsubscribes", async () => {
    let show = true;
    let theme = "dark";
    const h = await mount((b) =>
      cascade(b, { Name: "Theme", Value: theme }, (inner) => {
        if (show) component(NamedConsumer)(inner);
      }),
    );
    const supplier = [...h.root.slotChildren.values()][0]!;
    const consumer = descendants(supplier)[0]!;
    expect([...supplier.subscribers!]).toEqual([consumer]);
    expect(consumer.cascadingSuppliers).toEqual([supplier]);
    show = false;
    await h.update();
    expect(consumer.disposed).toBe(true);
    expect(supplier.subscribers!.size).toBe(0);
    expect(consumer.cascadingSuppliers).toBeNull();
    log.length = 0;
    theme = "light";
    await h.update();
    expect(log).toEqual([]);
  });

  it("a hand-written supplier notifies when it re-renders with a new value", async () => {
    class Provider extends ComponentBase {
      @Parameter() childContent?: RenderFragment;
      readonly isCascadingValueSupplier = true;
      readonly isFixed = false;
      readonly cascadeName = "Theme";
      current = "dark";
      get cascadeValue(): unknown {
        return this.current;
      }
      toggle(): void {
        this.current = "light";
        this.stateHasChanged();
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        this.childContent?.(b);
      }
    }
    const h = await mount((b) => {
      b.openComponent(0, defineComponent(Provider));
      b.addAttribute(1, "ChildContent", walled(component(NamedConsumer)));
      b.closeComponent();
    });
    expect(h.container.textContent).toBe("dark");
    const provider = [...h.root.slotChildren.values()][0]!.component as Provider;
    provider.toggle();
    await h.renderer.waitUntilIdle();
    expect(h.container.textContent).toBe("light");
  });
});

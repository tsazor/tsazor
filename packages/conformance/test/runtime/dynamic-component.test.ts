/**
 * DynamicComponent vs. Blazor (DynamicComponent.cs): Type/Parameters, instance
 * capture, the explicit unknown-parameter error pointing at `Parameters`, and
 * the null-Type error. Roadmap 3.2.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  ComponentBase,
  defineComponent,
  DynamicComponent,
  Parameter,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { host, log, Probe, type Build } from "./host.js";
import { compileFiles, errorCodes, mount } from "../harness.js";

/** A second component class for the type-change tests. */
class Alt extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "u");
    b.addContent(1, "alt");
    b.closeElement();
  }
}

/** A component rendering its childContent plus a text label. */
class WithChild extends ComponentBase {
  @Parameter() label = "";
  @Parameter() childContent?: (b: RenderTreeBuilder) => void;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "em");
    b.addContent(1, this.label);
    b.closeElement();
    this.childContent?.(b);
  }
}

/** Build frames for one DynamicComponent instance. */
const dyn = (type: unknown, parameters?: Record<string, unknown>, extra: Build = () => {}): Build => (b) => {
  b.openComponent(0, defineComponent(DynamicComponent));
  b.addAttribute(1, "type", type as never);
  if (parameters) b.addAttribute(2, "parameters", parameters as never);
  extra(b);
  b.closeComponent();
};

beforeEach(() => {
  log.length = 0;
});

describe("DynamicComponent (3.2)", () => {
  it("renders the component given as type and passes the parameter dictionary", async () => {
    const h = await host(dyn(Probe, { label: "from-dict" }));
    expect(h.text()).toBe("from-dict");
  });

  it("a dictionary change updates the child's parameters without replacing the instance", async () => {
    await host(dyn(Probe, { label: "one" }));
    log.length = 0;
    const h = await host(dyn(Probe, { label: "one" }));
    await h.update(dyn(Probe, { label: "two" }));
    expect(h.text()).toBe("two");
    expect(log).toEqual(expect.arrayContaining(["pset:two", "render:two"]));
    expect(log).not.toContain("dispose:one");
  });

  it("a type change replaces the child (old instance disposed, new one initialized)", async () => {
    const h = await host(dyn(Probe, { label: "first" }));
    log.length = 0;
    // An empty dictionary is passed so no stale parameter reaches the new type
    // (parameters omitted from the new view are RETAINED — Blazor quirk).
    await h.update(dyn(Alt, {}));
    expect(h.text()).toContain("alt");
    expect(log).toEqual(expect.arrayContaining(["dispose:first"]));
    expect(log).not.toContain("pset:first");
  });

  it("captures the rendered instance via the component reference capture", async () => {
    let dynInstance: DynamicComponent | null = null;
    const h = await host(dyn(Probe, { label: "captured" }, (b) => {
      b.addComponentReferenceCapture(3, (component) => (dynInstance = component as DynamicComponent));
    }));
    expect(dynInstance).toBeInstanceOf(DynamicComponent);
    expect(dynInstance!.instance).toBeInstanceOf(Probe);
    expect((dynInstance!.instance as Probe).label).toBe("captured");
    expect(h.text()).toBe("captured");
  });

  it("parameters can carry childContent (a fragment flows through the dictionary)", async () => {
    const h = await host(dyn(WithChild, {
      label: "parent",
      childContent: (b: RenderTreeBuilder) => {
        b.openElement(0, "b");
        b.addContent(1, "inner");
        b.closeElement();
      },
    }));
    expect(h.text()).toBe("parentinner");
  });

  it("rejects a direct parameter with Blazor's error pointing at Parameters", async () => {
    const h = await host(dyn(Probe, { label: "dict" }));
    await expect(h.update((b) => {
      b.openComponent(0, defineComponent(DynamicComponent));
      b.addAttribute(1, "type", Probe as never);
      b.addAttribute(2, "parameters", { label: "dict" } as never);
      b.addAttribute(3, "label", "direct");
      b.closeComponent();
    })).rejects.toThrow(/DynamicComponent does not accept a parameter with the name 'label'/);
    await expect(
      h.update((b) => {
        b.openComponent(0, defineComponent(DynamicComponent));
        b.addAttribute(1, "type", Probe as never);
        b.addAttribute(2, "nope", "direct");
        b.closeComponent();
      }),
    ).rejects.toThrow(/does not accept a parameter with the name 'nope'/);
  });

  it("a null type throws (Blazor: 'requires a non-null value for the parameter Type')", async () => {
    await expect(host(dyn(null))).rejects.toThrow(/DynamicComponent requires a non-null value for the parameter Type/);
  });
});

describe("DynamicComponent in markup (3.2)", () => {
  const widgets = `
import { ComponentBase, Parameter, type RenderTreeBuilder } from "@tsazor/runtime";
export class Counter extends ComponentBase {
  @Parameter() label = "";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "span");
    b.addAttribute(1, "class", "counter");
    b.addContent(2, \`counter:\${this.label}\`);
    b.closeElement();
  }
}
export class Widget extends ComponentBase {
  @Parameter() label = "";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "span");
    b.addAttribute(1, "class", "widget");
    b.addContent(2, \`widget:\${this.label}\`);
    b.closeElement();
  }
}
`;

  it("renders Type/Parameters from markup (PascalCase attributes)", async () => {
    const m = await mount({
      "widgets.ts": widgets,
      "Test.tsazor": `@import { Counter } from "./widgets"
<DynamicComponent Type="@picked" Parameters="@params" />
@code {
    picked = Counter;
    params = { label: "markup" };
}`,
    });
    expect(m.container.querySelector("span.counter")?.textContent).toBe("counter:markup");
    expect(m.diagnostics).toEqual([]);
  });

  it("swapping the type replaces the rendered component", async () => {
    const m = await mount({
      "widgets.ts": widgets,
      "Test.tsazor": `@import { Counter, Widget } from "./widgets"
<DynamicComponent Type="@picked" Parameters="@params" />
<button @onclick="@(( ) => this.picked = Widget)">swap</button>
@code {
    picked = Counter;
    params = { label: "one" };
}`,
    });
    expect(m.container.querySelector("span.counter")).not.toBeNull();
    m.container.querySelector("button")!.dispatchEvent(new MouseEvent("click"));
    await m.settle();
    expect(m.container.querySelector("span.counter")).toBeNull();
    expect(m.container.querySelector("span.widget")?.textContent).toBe("widget:one");
  });

  it("rejects direct markup parameters at compile time (TZS025, 2.1 metadata)", async () => {
    // 2.1's parameter validation knows DynamicComponent's manifest (only
    // type/parameters declared), so the markup parameter is TZS025 — exactly
    // what the runtime error says in hand-built trees.
    const compiled = await compileFiles({
      "widgets.ts": widgets,
      "Test.tsazor": `@import { Counter } from "./widgets"
<DynamicComponent Type="@picked" Label="direct" />
@code {
    picked = Counter;
}`,
    });
    const list = compiled.diagnostics["Test.tsazor"] ?? [];
    expect(errorCodes(list)).toEqual(["TZS025"]);
    expect(list[0]!.message).toContain("does not have a parameter 'Label'");
  });
});
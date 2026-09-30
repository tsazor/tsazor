/**
 * Parameters, cascading values and change detection.
 * Review §3: R8, R11, R12, T3, `/^on/i` EventCallback wrapping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CascadingParameter,
  CascadingValue,
  ComponentBase,
  defineComponent,
  EventCallback,
  Parameter,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { host, log, Probe } from "./host.js";

afterEach(() => {
  log.length = 0;
});

describe("R8 — parameter change detection", () => {
  it.fails("a child with unchanged primitive parameters is not re-rendered", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(Probe));
      b.addAttribute(1, "label", "same");
      b.closeComponent();
    });
    log.length = 0;
    await h.update();
    expect(log).toEqual([]);
  });

  it("a child with a changed parameter is re-rendered", async () => {
    let label = "a";
    const h = await host((b) => {
      b.openComponent(0, defineComponent(Probe));
      b.addAttribute(1, "label", label);
      b.closeComponent();
    });
    label = "b";
    await h.update();
    expect(h.text()).toBe("b");
  });
});

class Consumer extends ComponentBase {
  theme?: string;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, this.theme ?? "none");
  }
}
CascadingParameter({ name: "Theme" })(Consumer.prototype, "theme");

describe("R11 — named cascading values", () => {
  it.fails("CascadingValue Name matches CascadingParameter({ name })", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(CascadingValue));
      b.addAttribute(1, "Name", "Theme");
      b.addAttribute(2, "Value", "dark");
      b.addAttribute(3, "ChildContent", ((inner: RenderTreeBuilder) => {
        inner.openComponent(0, defineComponent(Consumer));
        inner.closeComponent();
      }) as never);
      b.closeComponent();
    });
    expect(h.text()).toBe("dark");
  });
});

describe("R12 — cascading updates reach subscribers directly", () => {
  it.fails("through an intermediate component that does not re-render", async () => {
    class Wall extends ComponentBase {
      childContent?: (b: RenderTreeBuilder) => void;
      private rendered = false;
      protected override shouldRender(): boolean {
        return !this.rendered;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        this.rendered = true;
        this.childContent?.(b);
      }
    }
    Parameter()(Wall.prototype, "childContent");
    // By-type cascade (not by name) so this test measures R12 only, not R11.
    class Box {
      constructor(readonly n: number) {}
    }
    class NumberConsumer extends ComponentBase {
      box?: Box;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, String(this.box?.n));
      }
    }
    CascadingParameter({ type: Box })(NumberConsumer.prototype, "box");

    let n = 1;
    const h = await host((b) => {
      b.openComponent(0, defineComponent(CascadingValue));
      b.addAttribute(2, "value", new Box(n) as never);
      b.addAttribute(3, "childContent", ((inner: RenderTreeBuilder) => {
        inner.openComponent(0, defineComponent(Wall));
        inner.addAttribute(1, "childContent", ((wallInner: RenderTreeBuilder) => {
          wallInner.openComponent(0, defineComponent(NumberConsumer));
          wallInner.closeComponent();
        }) as never);
        inner.closeComponent();
      }) as never);
      b.closeComponent();
    });
    expect(h.text()).toBe("1");
    n = 2;
    await h.update();
    expect(h.text()).toBe("2");
  });
});

describe("parameters", () => {
  it("T3 — an unknown parameter is reported (Blazor throws)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let rejected = false;
    try {
      await host((b) => {
        b.openComponent(0, defineComponent(Probe));
        b.addAttribute(1, "lable", "typo");
        b.closeComponent();
      });
    } catch {
      rejected = true;
    }
    const reported = rejected || error.mock.calls.some((c) => /lable/.test(c.map(String).join(" ")));
    error.mockRestore();
    expect(reported).toBe(true);
  });

  it.fails("a function parameter whose name starts with 'on' is passed through unchanged", async () => {
    class Filter extends ComponentBase {
      onlyIf?: (n: number) => boolean;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, `${typeof this.onlyIf}:${this.onlyIf instanceof EventCallback}`);
      }
    }
    Parameter()(Filter.prototype, "onlyIf");
    const h = await host((b) => {
      b.openComponent(0, defineComponent(Filter));
      b.addAttribute(1, "onlyIf", ((n: number) => n > 1) as never);
      b.closeComponent();
    });
    expect(h.text()).toBe("function:false");
  });
});

/**
 * ErrorBoundary vs. Blazor (HandleExceptionViaErrorBoundary, ErrorBoundaryBase).
 * Review §3 (ErrorBoundaries), roadmap 3.1.
 *
 * `settle()` rethrows the renderer's collected failures, so any "handled"
 * assertion fails loudly when the error instead reaches the error handler –
 * tests that expect a handling boundary therefore run their own renderer with
 * a capturing handler where needed.
 */
import { describe, expect, it } from "vitest";
import {
  ComponentBase,
  defineComponent,
  ErrorBoundary,
  EventCallback,
  Parameter,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { host, Probe, log, type Build } from "./host.js";
import { createTestRenderer, mount } from "../harness.js";

describe("ErrorBoundary in markup (3.1)", () => {
  it("the built-in tag renders healthy, then ErrorContent after a failed child render", async () => {
    const m = await mount(`<ErrorBoundary ChildContent="@child">
    <ErrorContent Context="problem">
        <b class="err">@problem.message</b>
    </ErrorContent>
</ErrorBoundary>
<button @onclick="@(( ) => this.explode = true)">break</button>
@code {
    @Parameter() explode = false;
    private child = (b: RenderTreeBuilder): void => {
        b.openElement(0, "i");
        b.addContent(1, this.explode ? undefined : "healthy");
        b.closeElement();
        if (this.explode) throw new Error("kaboom");
    };
}`);
    expect(m.container.querySelector("i")?.textContent).toBe("healthy");
    m.container.querySelector("button")!.dispatchEvent(new MouseEvent("click"));
    await m.settle();
    expect(m.container.querySelector(".err")?.textContent).toBe("kaboom");
  });

  it("the default error UI is the blazor-error-boundary div (no ErrorContent slot)", async () => {
    const m = await mount({
      "Test.tsazor": `<ErrorBoundary>
    <Bomber Boom="@true" Label="markup-boom" />
</ErrorBoundary>`,
      "Bomber.tsazor": `<p class="ok">@(Label)</p>
@code {
    @Parameter() Label = "";
    @Parameter() Boom = false;
    protected override onInitialized(): void {
        if (this.Boom) throw new Error(this.Label);
    }
}`,
    });
    expect(m.container.querySelector("div.blazor-error-boundary") !== null).toBe(true);
    expect(m.container.querySelector(".ok")).toBeNull();
  });
});

/** A child that fails where asked. */
class Bomber extends ComponentBase {
  @Parameter() label = "boom";
  @Parameter() failIn: "render" | "init" | "dispose" | "afterRender" = "render";
  protected override onInitialized(): void {
    if (this.failIn === "init") throw new Error(this.label);
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (this.failIn === "render") throw new Error(this.label);
    b.openElement(0, "b");
    b.addContent(1, this.label);
    b.closeElement();
  }
  protected override onAfterRender(firstRender: boolean): void {
    if (this.failIn === "afterRender" && firstRender) throw new Error(this.label);
  }
  dispose(): void {
    if (this.failIn === "dispose") throw new Error(this.label);
  }
}

/** Child content markup for one Bomber instance failing as configured. */
const bomber = (label: string, failIn: Bomber["failIn"] = "render"): Build =>
  (b: RenderTreeBuilder) => {
    b.openComponent(0, defineComponent(Bomber));
    b.addAttribute(1, "label", label);
    b.addAttribute(2, "failIn", failIn);
    b.closeComponent();
  };

/**
 * Mounts the root as an ErrorBoundary around `content`, capturing the
 * boundary instance (via a component reference capture) and the error
 * ErrorContent rendered (its fragment records the exception it received).
 */
async function boundaryHost(content: (b: RenderTreeBuilder) => void, extra: Record<string, unknown> = {}) {
  let boundary!: ErrorBoundary;
  let captured: unknown = null;
  const errorContent = (error: unknown) => (inner: RenderTreeBuilder) => {
    captured = error;
    inner.openElement(0, "span");
    inner.addAttribute(1, "class", "err");
    inner.addContent(2, String((error as Error).message));
    inner.closeElement();
  };
  const h = await host((b) => {
    b.openComponent(0, defineComponent(ErrorBoundary));
    b.addAttribute(1, "errorContent", errorContent);
    for (const [name, value] of Object.entries(extra)) b.addAttribute(2, name, value as never);
    b.addAttribute(3, "childContent", content);
    b.addComponentReferenceCapture(4, (component) => (boundary = component as ErrorBoundary));
    b.closeComponent();
  });
  return { h, boundary, capturedError: () => captured, errorContent };
}

describe("ErrorBoundary (3.1)", () => {
  it("catches a child render error and renders ErrorContent with the exception", async () => {
    const { h, capturedError } = await boundaryHost(bomber("boom"));
    expect(h.container.querySelector(".err")?.textContent).toBe("boom");
    expect((capturedError() as Error).message).toBe("boom");
  });

  it("renders the default blazor-error-boundary div without ErrorContent", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(1, "childContent", bomber("boom"));
      b.closeComponent();
    });
    expect(h.container.querySelector("div.blazor-error-boundary") !== null).toBe(true);
  });

  it("shows ChildContent while healthy", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(1, "childContent", (inner: RenderTreeBuilder) => {
        inner.openElement(0, "i");
        inner.addContent(1, "ok");
        inner.closeElement();
      });
      b.closeComponent();
    });
    expect(h.container.querySelector(".err")).toBeNull();
    expect(h.text()).toContain("ok");
  });

  it("unmounts and disposes the failed subtree (healthy siblings go too)", async () => {
    log.length = 0;
    const { h } = await boundaryHost((inner: RenderTreeBuilder) => {
      inner.openComponent(0, defineComponent(Probe));
      inner.addAttribute(1, "label", "healthy");
      inner.closeComponent();
      bomber("boom")(inner);
    });
    expect(log).toEqual(expect.arrayContaining(["render:healthy", "dispose:healthy"]));
    expect(h.container.querySelector(".err")?.textContent).toBe("boom");
  });

  it("Recover leaves the error state and re-renders the child content", async () => {
    const { h, boundary } = await boundaryHost(bomber("boom"));
    expect(h.container.querySelector(".err")).not.toBeNull();
    // The caller fixes the content first (new child content), then recovers –
    // Blazor semantics: Recover renders whatever ChildContent is now.
    await h.update((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(1, "errorContent", (error: unknown) => (inner: RenderTreeBuilder) => {
        inner.openElement(0, "span");
        inner.addAttribute(1, "class", "err");
        inner.addContent(2, String((error as Error).message));
        inner.closeElement();
      });
      b.addAttribute(3, "childContent", (inner: RenderTreeBuilder) => {
        inner.openElement(0, "i");
        inner.addContent(1, "ok");
        inner.closeElement();
      });
      b.closeComponent();
    });
    boundary.recover();
    await h.settle();
    expect(h.container.querySelector(".err")).toBeNull();
    expect(h.container.querySelector(".blazor-error-boundary")).toBeNull();
  });

  it("Recover is a no-op outside the error state", async () => {
    const { h, boundary } = await boundaryHost((inner: RenderTreeBuilder) => {
      inner.openElement(0, "i");
      inner.addContent(1, "ok");
      inner.closeElement();
    });
    expect(() => boundary.recover()).not.toThrow();
    expect(h.text()).toContain("ok");
  });

  it("Recover resets the error count: a handled error per recovery stays non-fatal", async () => {
    const { h, boundary } = await boundaryHost(bomber("again"), { maximumErrorCount: 1 });
    await h.settle();
    boundary.recover();
    await h.settle();
    // The restored child content fails again; with the reset count this is
    // handled a second time instead of exceeding the maximum of 1.
    boundary.recover();
    await h.settle();
    expect(h.container.querySelector(".err")?.textContent).toBe("again");
  });

  it("the nearest boundary wins (an outer boundary stays untouched)", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(2, "errorContent", (error: unknown) => (inner: RenderTreeBuilder) => {
        inner.addContent(0, `outer:${(error as Error).message}`);
      });
      b.addAttribute(1, "childContent", (inner: RenderTreeBuilder) => {
        inner.openComponent(0, defineComponent(ErrorBoundary));
        inner.addAttribute(1, "errorContent", showErrorMessage);
        inner.addAttribute(2, "childContent", bomber("nested"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    expect(h.text()).not.toContain("outer:");
    expect(h.container.querySelector(".err")?.textContent).toContain("nested");
  });

  it("a lifecycle fault (throw in onInitialized) is routed to the boundary", async () => {
    const { h } = await boundaryHost(bomber("init-boom", "init"));
    expect(h.container.querySelector(".err")?.textContent).toBe("init-boom");
  });

  it("an after-render fault is routed to the boundary", async () => {
    const { h } = await boundaryHost(bomber("after-boom", "afterRender"));
    expect(h.container.querySelector(".err")?.textContent).toBe("after-boom");
  });

  it("a synchronous event handler fault is routed to the boundary", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(1, "errorContent", showErrorMessage);
      b.addAttribute(3, "childContent", (inner: RenderTreeBuilder) => {
        inner.openElement(0, "button");
        inner.addEventHandler(1, "onclick", EventCallback.unbound(() => {
          throw new Error("sync-click");
        }));
        inner.closeElement();
      });
      b.closeComponent();
    });
    h.container.querySelector("button")!.dispatchEvent(new MouseEvent("click"));
    await h.settle();
    expect(h.container.querySelector(".err")?.textContent).toBe("sync-click");
  });

  it("an async event handler fault is routed to the boundary", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(1, "errorContent", showErrorMessage);
      b.addAttribute(3, "childContent", (inner: RenderTreeBuilder) => {
        inner.openElement(0, "button");
        inner.addEventHandler(1, "onclick", EventCallback.unbound(async () => {
          throw new Error("async-click");
        }));
        inner.closeElement();
      });
      b.closeComponent();
    });
    h.container.querySelector("button")!.dispatchEvent(new MouseEvent("click"));
    await h.settle();
    expect(h.container.querySelector(".err")?.textContent).toBe("async-click");
  });

  /** ErrorContent: `<span class="err">{message}</span>`. */
  const showErrorMessage = (error: unknown) => (inner: RenderTreeBuilder) => {
    inner.openElement(0, "span");
    inner.addAttribute(1, "class", "err");
    inner.addContent(2, String((error as Error).message));
    inner.closeElement();
  };

  it("a dispose error is NOT caught by the boundary (always fatal)", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(1, "childContent", bomber("fatal-dispose", "dispose"));
      b.closeComponent();
    });
    const failures: { phase: string; error: unknown }[] = [];
    h.renderer.errorHandler = (e) => failures.push({ phase: e.phase, error: e.error });
    // The root's next pass replaces the boundary entirely, which disposes the
    // Bomber — its dispose throws, and no boundary may catch that.
    await h.update(() => {});
    expect(failures).toEqual([{ phase: "dispose", error: expect.objectContaining({ message: "fatal-dispose" }) }]);
    expect(h.container.querySelector(".err")).toBeNull();
  });

  it("errors over MaximumErrorCount are fatal (infinite error-content loop guard)", async () => {
    // Mounted with a capturing error handler from the start: the fatal error
    // happens while the first batch is still flushing.
    const h = await hostWithCapturingErrors((b) => {
      b.openComponent(0, defineComponent(ErrorBoundary));
      b.addAttribute(1, "maximumErrorCount", 1);
      // ErrorContent that itself throws: handled again, exceeding the maximum.
      b.addAttribute(2, "errorContent", () => () => {
        throw new Error("error-content-fail");
      });
      b.addAttribute(3, "childContent", bomber("boom"));
      b.closeComponent();
    });
    expect(h.failures.length).toBe(1);
    expect((h.failures[0] as Error).message).toBe("error-content-fail");
  });
});

/**
 * host() variant with the error handler replaced before the mount — for
 * failures that are fatal during the first batch.
 */
class TestHost extends ComponentBase {
  build: Build = () => {};
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.build(b);
  }
  private rerender(): void {
    this.stateHasChanged();
  }
}

async function hostWithCapturingErrors(build: Build) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = createTestRenderer();
  const failures: unknown[] = [];
  renderer.errorHandler = (e) => failures.push(e.error);
  const state = renderer.renderInContainer(defineComponent(TestHost), container);
  const component = state.component as TestHost;
  component.build = build;
  component.rerender();
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
  return { container, renderer, failures };
}
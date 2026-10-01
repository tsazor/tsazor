/**
 * MarkupString vs. Blazor (@(new MarkupString(html)) renders raw, plain
 * strings stay escaped; the compiler bakes the forms into Markup frames and
 * the runtime unwraps instances in hand-built trees). Roadmap 3.3, review §3.
 */
import { describe, expect, it } from "vitest";
import {
  ComponentBase,
  defineComponent,
  MarkupString,
  Parameter,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { host } from "./host.js";
import { mount } from "../harness.js";

describe("MarkupString in markup (3.3)", () => {
  it("new MarkupString(inner) renders unescaped HTML", async () => {
    const m = await mount(`@import { MarkupString } from "@tsazor/runtime"
@(new MarkupString("<b class=\\"t\\">bold</b>"))
<p>after</p>`);
    expect(m.container.querySelector("b.t")?.textContent).toBe("bold");
    expect(m.text()).toContain("bold");
    expect(m.text()).toContain("after");
    expect(m.diagnostics).toEqual([]);
  });

  it("a plain string stays escaped (plain @expression is no markup)", async () => {
    const m = await mount(`@("<b>not-bold</b>")`);
    expect(m.container.querySelector("b")).toBeNull();
    expect(m.container.innerHTML).toContain("&lt;b&gt;");
  });

  it("expr as MarkupString renders markup — the C# (MarkupString)s analogue", async () => {
    const m = await mount(`@import { MarkupString } from "@tsazor/runtime"
@(this.raw as MarkupString)
@code {
    raw = "<i>slanted</i>";
}`);
    expect(m.container.querySelector("i")?.textContent).toBe("slanted");
  });

  it("a MarkupString field renders through the runtime unwrap and diffs raw", async () => {
    const m = await mount({
      "Test.tsazor": `@import { MarkupString } from "@tsazor/runtime"
<h1>@title</h1>
<button @onclick="@(( ) => this.flip())">go</button>
@code {
    title: MarkupString = new MarkupString("<b>first</b>");
    flip(): void {
        this.title = new MarkupString("<em>second</em>");
    }
}`,
    });
    expect(m.container.querySelector("b")?.textContent).toBe("first");
    m.container.querySelector("button")!.dispatchEvent(new MouseEvent("click"));
    await m.settle();
    expect(m.container.querySelector("b")).toBeNull();
    expect(m.container.querySelector("em")?.textContent).toBe("second");
  });

  it("an import alias (MarkupString as Raw) is recognized", async () => {
    const m = await mount(`@import { MarkupString as Raw } from "@tsazor/runtime"
@(new Raw("<u>under</u>"))`);
    expect(m.container.querySelector("u")?.textContent).toBe("under");
  });

  it("a same-named local class is NOT rewritten (shadowed import binds markup off)", async () => {
    const m = await mount({
      "local.ts": `export class MarkupString {
    constructor(public value: string) {}
}`,
      "Test.tsazor": `@import { MarkupString } from "./local"
@(new MarkupString("<b>local</b>"))`,
    });
    expect(m.container.querySelector("b")).toBeNull();
  });

  it("MarkupString content inside a component slot renders unescaped", async () => {
    const m = await mount({
      "Box.tsazor": `<section>@Body</section>
@code {
    @Parameter() Body?: RenderFragment;
}`,
      "Test.tsazor": `@import { MarkupString } from "@tsazor/runtime"
@import type { RenderFragment } from "@tsazor/runtime"
<Box><Body>@(new MarkupString("<b>in-slot</b>"))</Body></Box>`,
    });
    expect(m.container.querySelector("section b")?.textContent).toBe("in-slot");
  });
});

describe("MarkupString runtime (3.3)", () => {
  it("addContent unwraps a MarkupString instance into a Markup frame (raw HTML)", async () => {
    const h = await host((b) => {
      b.addContent(0, new MarkupString("<b>hand</b>"));
      b.addContent(1, "text");
    });
    expect(h.container.querySelector("b")?.textContent).toBe("hand");
    expect(h.text()).toBe("handtext");
  });

  it("a MarkupString instance passed as child content renders raw inside the component frame", async () => {
    class Box extends ComponentBase {
      @Parameter() childContent?: (b: RenderTreeBuilder) => void;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        this.childContent?.(b);
      }
    }
    const h = await host((b) => {
      b.openComponent(0, defineComponent(Box));
      b.addContent(1, new MarkupString("<b>wrapped</b>"));
      b.closeComponent();
    });
    expect(h.container.querySelector("b")?.textContent).toBe("wrapped");
  });

  it("toString returns the value", () => {
    expect(new MarkupString("<b>x</b>").toString()).toBe("<b>x</b>");
  });
});
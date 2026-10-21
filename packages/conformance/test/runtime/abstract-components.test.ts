/**
 * Abstract components and the markup of a base (the BlazorHero port's ExtendedAttributes, B38): an abstract generic
 * .tsazor with markup; a code-only class built on it that hands its markup out (`builder => base.BuildRenderTree(builder)`
 * in C#, `super.buildRenderTree(builder)` here); and a page built on that one, with markup of its own that renders the
 * base's (`@Inherited()`), implementing the abstract member the base's markup reads.
 */
import { describe, expect, it } from "vitest";
import { mount } from "../harness";

const files = {
  "ExtendedAttributesBase.tsazor": [
    "@typeparam TEntity",
    "<h2>@title</h2>",
    '<p class="policy">@viewPolicy</p>',
    "",
    "@code {",
    '    @Parameter() title = "Attributes";',
    "    protected abstract get viewPolicy(): string;",
    "}",
    "",
  ].join("\n"),
  "ExtendedAttributes.ts": [
    'import type { RenderFragment, RenderTreeBuilder } from "@tsazor/runtime";',
    'import ExtendedAttributesBase from "./ExtendedAttributesBase.tsazor.mjs";',
    "",
    "/** The base's markup, for a page with markup of its own (ExtendedAttributes.razor.cs' Inherited()). */",
    "export abstract class ExtendedAttributes<TEntity> extends ExtendedAttributesBase<TEntity> {",
    "  protected inherited(): RenderFragment {",
    "    return (builder: RenderTreeBuilder) => super.buildRenderTree(builder);",
    "  }",
    "}",
    "",
  ].join("\n"),
  "Test.tsazor": [
    '@import { ExtendedAttributes } from "./ExtendedAttributes"',
    "@inherits ExtendedAttributes<number>",
    "<section>@this.inherited()</section>",
    "",
    "@code {",
    "    protected override get viewPolicy(): string {",
    '        return "Permissions.Documents.View";',
    "    }",
    "}",
    "",
  ].join("\n"),
};

describe("abstract components", () => {
  it("a page renders its abstract generic base's markup through a code-only class, with the member it implements", async () => {
    const m = await mount(files);
    expect(m.html()).toBe('<section><h2>Attributes</h2><p class="policy">Permissions.Documents.View</p></section>');
  });
});

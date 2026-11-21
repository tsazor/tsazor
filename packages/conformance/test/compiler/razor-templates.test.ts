/**
 * F3/F17: Razor templates in `@code` (Blazor's templated delegates, "Razor templates" in the Blazor docs):
 * `@<tag>…</tag>` is a RenderFragment, `(item: T) => @<li>@item.name</li>` a RenderFragment<T>.
 */
import { describe, expect, it } from "vitest";
import { errorCodes, mount } from "../harness.js";

describe("Razor templates in @code", () => {
  it("a template is a RenderFragment: rendered with @, passed to a slot, reading members", async () => {
    const m = await mount({
      "Test.tsazor": [
        "<section>@timeTemplate</section>",
        "<Card Footer=\"@(showFooter ? footer : undefined)\">body</Card>",
        "@code {",
        "    private label = \"now\";",
        "    private showFooter = true;",
        "    private readonly timeTemplate: RenderFragment = @<p class=\"time\">The time is @label.</p>;",
        "    private readonly footer: RenderFragment = @<footer>Don't { panic }</footer>;",
        "}",
      ].join("\n"),
      "Card.tsazor": [
        "<div class=\"card\">@childContent@if (footer) {<hr />@footer}</div>",
        "@code {",
        "    @Parameter() childContent?: RenderFragment;",
        "    @Parameter() footer?: RenderFragment;",
        "}",
      ].join("\n"),
    });
    expect(m.diagnostics).toEqual([]);
    expect(m.html()).toBe('<section><p class="time">The time is now.</p></section><div class="card">body<hr><footer>Don\'t { panic }</footer></div>');
  });

  it("a lambda over a template is a RenderFragment<T>: its parameter is a local of the markup", async () => {
    const m = await mount({
      "Test.tsazor": [
        "<ul>",
        "    @foreach (const pet of pets) {",
        "        @petTemplate(pet)",
        "    }",
        "</ul>",
        "<ol>@rows(pets)</ol>",
        "@code {",
        "    private name = \"(member)\";",
        "    private readonly pets = [{ name: \"Rex\" }, { name: \"Tom\" }];",
        "    private readonly petTemplate: RenderFragment<{ name: string }> = (pet) => @<li>Pet: @pet.name</li>;",
        "    private rows(items: { name: string }[]): RenderFragment {",
        "        const name = \"(local)\";",
        "        return @<li>@items.length @name</li>;",
        "    }",
        "}",
      ].join("\n"),
    });
    expect(m.diagnostics).toEqual([]);
    expect(m.html().replace(/\s+</g, "<")).toBe("<ul><li>Pet: Rex</li><li>Pet: Tom</li></ul><ol><li>2 (local)</li></ol>");
  });

  it("a template holds components, control flow and events", async () => {
    const m = await mount({
      "Test.tsazor": [
        "@body",
        "@code {",
        "    private count = 0;",
        "    private readonly body: RenderFragment = @<div>",
        "        @if (count > 0) {",
        "            <b>@count</b>",
        "        }",
        "        <button @onclick=\"() => count++\">add</button>",
        "    </div>;",
        "}",
      ].join("\n"),
    });
    expect(errorCodes(m.diagnostics)).toEqual([]);
    expect(m.html().replace(/\s+</g, "<")).toBe("<div><button>add</button></div>");
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.html().replace(/\s+</g, "<")).toBe("<div><b>1</b><button>add</button></div>");
  });
});

/**
 * Component attributes and binding. Review §1: C12, C13, C15, C16, C17 plus the
 * Phase-0 finding `Interval="@4000"`.
 */
import { describe, expect, it } from "vitest";
import { mount } from "../harness.js";

const probe = `<span>@(typeof Value):@(String(Value))</span>\n@code { @Parameter() Value: unknown; }`;

describe("C12 — attribute values on non-string parameters are expressions", () => {
  it.fails('Value="5" on a number parameter passes 5', async () => {
    const m = await mount({
      "Test.tsazor": `<Probe Value="5" />`,
      "Probe.tsazor": `<span>@(typeof Value):@(String(Value))</span>\n@code { @Parameter() Value = 0; }`,
    });
    expect(m.text()).toBe("number:5");
  });

  it.fails('Value="true" on a boolean parameter passes true', async () => {
    const m = await mount({
      "Test.tsazor": `<Probe Value="true" />`,
      "Probe.tsazor": `<span>@(typeof Value):@(String(Value))</span>\n@code { @Parameter() Value = false; }`,
    });
    expect(m.text()).toBe("boolean:true");
  });

  it.fails('Value="@4000" is the number 4000, never the string "@4000"', async () => {
    const m = await mount({ "Test.tsazor": `<Probe Value="@4000" />`, "Probe.tsazor": probe });
    expect(m.text()).toBe("number:4000");
  });

  it.fails("On* parameters accept a bare method group", async () => {
    const m = await mount({
      "Test.tsazor": `<Clicker OnClick="handle" /><p>@count</p>\n@code { private count = 0; private handle() { this.count++; } }`,
      "Clicker.tsazor": `<button @onclick="() => OnClick.invokeAsync()">c</button>\n@code { @Parameter() OnClick!: EventCallback; }`,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.text()).toBe("c1");
  });
});

describe("C13 — templated components", () => {
  const grid = `
@foreach (var item in Items) {
    <tr>@RowTemplate(item)</tr>
}
@code {
    @Parameter() Items: string[] = [];
    @Parameter() RowTemplate!: RenderFragment<string>;
}`;

  it.fails("named RenderFragment<T> slot with @context", async () => {
    const m = await mount({
      "Test.tsazor": `<Grid Items="@items"><RowTemplate><td>@context</td></RowTemplate></Grid>\n@code { private items = ["a", "b"]; }`,
      "Grid.tsazor": grid,
    });
    expect(m.html()).toBe("<tr><td>a</td></tr><tr><td>b</td></tr>");
  });

  it.fails("Context=\"row\" renames the context parameter", async () => {
    const m = await mount({
      "Test.tsazor": `<Grid Items="@items"><RowTemplate Context="row"><td>@row</td></RowTemplate></Grid>\n@code { private items = ["a"]; }`,
      "Grid.tsazor": grid,
    });
    expect(m.html()).toBe("<tr><td>a</td></tr>");
  });

  it.fails("named non-generic slots next to each other", async () => {
    const m = await mount({
      "Test.tsazor": `<Panel><Header><h1>H</h1></Header><Body><p>B</p></Body></Panel>`,
      "Panel.tsazor": `<section>@Header@Body</section>\n@code { @Parameter() Header?: RenderFragment; @Parameter() Body?: RenderFragment; }`,
    });
    expect(m.html()).toBe("<section><h1>H</h1><p>B</p></section>");
  });
});

describe("C15 — event modifiers with values", () => {
  it.fails("@onclick:preventDefault=\"cond\" is a flag, not a second handler", async () => {
    const m = await mount(`<a href="#" @onclick="go" @onclick:preventDefault="prevent">x</a><p>@count</p>
@code { private count = 0; private prevent = true; private go() { this.count++; } }`);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    m.container.querySelector("a")!.dispatchEvent(event);
    await m.settle();
    expect({ count: m.text(), prevented: event.defaultPrevented }).toEqual({ count: "x1", prevented: true });
  });

  it.fails("a modifier without a handler is allowed", async () => {
    const m = await mount(`<form @onsubmit:preventDefault><button>s</button></form>`);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    m.container.querySelector("form")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

const field = `<button @onclick="() => ValueChanged.invokeAsync('x')">set</button>
@code { @Parameter() Value = ""; @Parameter() ValueChanged!: EventCallback<string>; }`;

describe("C16 — @bind-Value modifiers on components", () => {
  it.fails("@bind-Value:after runs after the assignment", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value="v" @bind-Value:after="changed" /><p>@v/@log</p>
@code { private v = ""; private log = ""; private changed() { this.log = "after:" + this.v; } }`,
      "Field.tsazor": field,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("x/after:x");
  });
});

describe("C17 — @bind targets", () => {
  it.fails("accepts a non-null assertion in the member path", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value="Model!.name" /><p>@Model!.name</p>
@code { private Model: { name: string } | null = { name: "" }; }`,
      "Field.tsazor": field,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("x");
  });
});

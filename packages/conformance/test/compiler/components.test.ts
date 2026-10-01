/**
 * Component attributes and binding. Review §1: C12, C13, C15, C16, C17 plus the
 * Phase-0 finding `Interval="@4000"`.
 */
import { describe, expect, it } from "vitest";
import { diagnosticsOf, errorCodes, mount } from "../harness.js";

const probe = `<span>@(typeof Value):@(String(Value))</span>\n@code { @Parameter() Value: unknown; }`;

describe("C12 — attribute values on non-string parameters are expressions", () => {
  it('Value="5" on a number parameter passes 5', async () => {
    const m = await mount({
      "Test.tsazor": `<Probe Value="5" />`,
      "Probe.tsazor": `<span>@(typeof Value):@(String(Value))</span>\n@code { @Parameter() Value = 0; }`,
    });
    expect(m.text()).toBe("number:5");
  });

  it('Value="true" on a boolean parameter passes true', async () => {
    const m = await mount({
      "Test.tsazor": `<Probe Value="true" />`,
      "Probe.tsazor": `<span>@(typeof Value):@(String(Value))</span>\n@code { @Parameter() Value = false; }`,
    });
    expect(m.text()).toBe("boolean:true");
  });

  it('Value="@4000" is the number 4000, never the string "@4000"', async () => {
    const m = await mount({ "Test.tsazor": `<Probe Value="@4000" />`, "Probe.tsazor": probe });
    expect(m.text()).toBe("number:4000");
  });

  it("On* parameters accept a bare method group", async () => {
    const m = await mount({
      "Test.tsazor": `<Clicker OnClick="handle" /><p>@count</p>\n@code { private count = 0; private handle() { this.count++; } }`,
      "Clicker.tsazor": `<button @onclick="() => OnClick.invokeAsync()">c</button>\n@code { @Parameter() OnClick!: EventCallback; }`,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.text()).toBe("c1");
  });
});

describe("2.2 — component attributes by parameter type", () => {
  const clicker = `<button @onclick="() => OnClick.invokeAsync()">c</button>\n@code { @Parameter() OnClick!: EventCallback; }`;

  it("a plain value on a non-string parameter is an expression over the component's members", async () => {
    const m = await mount({
      "Test.tsazor": `<List Items="people" Max="people.length - 1" />\n@code { private people = ["a", "b", "c"]; }`,
      "List.tsazor": `<span>@Items.slice(0, Max).join(",")</span>\n@code { @Parameter() Items: string[] = []; @Parameter() Max = 0; }`,
    });
    expect(m.text()).toBe("a,b");
  });

  it("a minimized attribute on a boolean parameter is true; a string parameter keeps text", async () => {
    const m = await mount({
      "Test.tsazor": `<Probe Enabled Title="5" />`,
      "Probe.tsazor": `<span>@(typeof Enabled):@(typeof Title)</span>\n@code { @Parameter() Enabled = false; @Parameter() Title = ""; }`,
    });
    expect(m.text()).toBe("boolean:string");
  });

  it("a lambda on an EventCallback parameter re-renders the authoring component", async () => {
    const m = await mount({
      "Test.tsazor": `<Clicker OnClick="() => count++" /><p>@count</p>\n@code { private count = 0; }`,
      "Clicker.tsazor": clicker,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.text()).toBe("c1");
  });

  it("a method group with a receiver runs on that receiver", async () => {
    const m = await mount({
      "Test.tsazor": `<Clicker OnClick="item.bump" /><p>@item.n</p>\n@code { private item = { n: 0, bump() { this.n++; } }; }`,
      "Clicker.tsazor": clicker,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.text()).toBe("c1");
  });

  it("a forwarded EventCallback passes through and keeps its receiver", async () => {
    const m = await mount({
      "Test.tsazor": `<Middle OnClick="handle" /><p>@count</p>\n@code { private count = 0; private handle() { this.count++; } }`,
      "Middle.tsazor": `<Clicker OnClick="OnClick" />\n@code { @Parameter() OnClick!: EventCallback; }`,
      "Clicker.tsazor": clicker,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.text()).toBe("c1");
  });

  it("a function on a value parameter is passed as a plain value, whatever its name", async () => {
    const m = await mount({
      "Test.tsazor": `<Filter onlyIf="(n) => n > 1" />`,
      "Filter.tsazor": `<span>@([1, 2, 3].filter((n) => onlyIf!(n)).join(","))</span>\n@code { @Parameter() onlyIf?: (n: number) => boolean; }`,
    });
    expect(m.text()).toBe("2,3");
  });

  it("a method group on a delegate parameter keeps `this`, with a stable identity across renders", async () => {
    const m = await mount({
      "Test.tsazor": `<Filter onlyIf="isVisible" /><Filter onlyIf="rules.strict" />
@code { private threshold = 1; private rules = { min: 2, strict(n: number) { return n > this.min; } };
    isVisible(n: number) { return n > this.threshold; } }`,
      "Filter.tsazor": `<span>@([1, 2, 3].filter((n) => onlyIf!(n)).join(","))|@seen.size|@renders;</span>
@code { @Parameter() onlyIf?: (n: number) => boolean; private seen = new Set<unknown>(); private renders = 0;
    protected override onParametersSet() { this.seen.add(this.onlyIf); this.renders++; } }`,
    });
    expect(m.text()).toBe("2,3|1|1;3|1|1;");
    await m.rerender();
    await m.rerender();
    // Same bound function every render; the child still re-renders, as Blazor
    // does for delegate parameters (not known-immutable types).
    expect(m.text()).toBe("2,3|1|3;3|1|3;");
  });

  it("an unknown parameter is a compile error with a suggestion (TZS025)", async () => {
    const diagnostics = await diagnosticsOf(`<Probe Titel="x" />`, { "Probe.tsazor": `@code { @Parameter() Title = ""; }` });
    expect(errorCodes(diagnostics)).toEqual(["TZS025"]);
    expect(diagnostics[0]!.message).toContain("Component 'Probe' does not have a parameter 'Titel'. Did you mean 'Title'?");
  });

  it("@bind-Value passes ValueExpression only where the component declares it", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value="v" /><p>@v</p>\n@code { private v = 1; }`,
      "Stepper.tsazor": `<button @onclick="() => ValueChanged.invokeAsync(Value + 1)">+</button>\n@code { @Parameter() Value = 0; @Parameter() ValueChanged!: EventCallback<number>; }`,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.text()).toBe("+2");
  });
});

describe("C13 — templated components", () => {
  const grid = `
@foreach (const item of Items) {
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
  it("@onclick:preventDefault=\"cond\" is a flag, not a second handler", async () => {
    const m = await mount(`<a href="#" @onclick="go" @onclick:preventDefault="prevent">x</a><p>@count</p>
@code { private count = 0; private prevent = true; private go() { this.count++; } }`);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    m.container.querySelector("a")!.dispatchEvent(event);
    await m.settle();
    expect({ count: m.text(), prevented: event.defaultPrevented }).toEqual({ count: "x1", prevented: true });
  });

  it("a modifier without a handler is allowed", async () => {
    const m = await mount(`<form @onsubmit:preventDefault><button>s</button></form>`);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    m.container.querySelector("form")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("the flag follows its expression from render to render", async () => {
    const m = await mount(`<div @onclick="outer"><a @onclick="go" @onclick:preventDefault="prevent" @onclick:stopPropagation="stop">x</a></div><p>@count/@bubbled</p>
@code { private count = 0; private bubbled = 0; private prevent = true; private stop = false;
    private go() { this.count++; this.prevent = !this.prevent; this.stop = !this.stop; }
    private outer() { this.bubbled++; } }`);
    const click = async (): Promise<boolean> => {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      m.container.querySelector("a")!.dispatchEvent(event);
      await m.settle();
      return event.defaultPrevented;
    };
    expect(await click()).toBe(true);
    expect(m.container.querySelector("p")!.textContent).toBe("1/1");
    expect(await click()).toBe(false);
    expect(m.container.querySelector("p")!.textContent).toBe("2/1");
    expect(await click()).toBe(true);
    expect(m.container.querySelector("p")!.textContent).toBe("3/2");
    expect(m.container.querySelector("a")!.getAttributeNames()).toEqual([]);
  });

  it("on a component it is an attribute its @attributes splat applies (FluentCMS Button)", async () => {
    const m = await mount({
      "Test.tsazor": `<div @onclick="outer"><Btn @onclick:stopPropagation="true" /></div><p>@bubbled</p>
@code { private bubbled = 0; private outer() { this.bubbled++; } }`,
      "Btn.tsazor": `<button @attributes="AdditionalAttributes">b</button>
@code { @Parameter({ captureUnmatchedValues: true }) AdditionalAttributes?: Record<string, unknown>; }`,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("0");
  });
});

const field = `<button @onclick="() => ValueChanged.invokeAsync('x')">set</button>
@code { @Parameter() Value = ""; @Parameter() ValueChanged!: EventCallback<string>; }`;

describe("C16 — @bind-Value modifiers on components", () => {
  it("@bind-Value:after runs after the assignment", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value="v" @bind-Value:after="changed" /><p>@v/@log</p>
@code { private v = ""; private log = ""; private changed() { this.log = "after:" + this.v; } }`,
      "Field.tsazor": field,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("x/after:x");
  });

  it("@bind-Value:get/:set bind through the setter", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value:get="v" @bind-Value:set="store" /><p>@v</p>
@code { private v = "a"; private store(value: string) { this.v = value.toUpperCase(); } }`,
      "Field.tsazor": `<span>@Value</span>${field}`,
    });
    expect(m.container.querySelector("span")!.textContent).toBe("a");
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("span")!.textContent).toBe("X");
    expect(m.container.querySelector("p")!.textContent).toBe("X");
  });

  it("an async :after is awaited before the re-render", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value="v" @bind-Value:after="changed" /><p>@log</p>
@code { private v = ""; private log = ""; private async changed() { await Promise.resolve(); this.log = "done:" + this.v; } }`,
      "Field.tsazor": field,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("done:x");
  });

  it("@bind-Value:set together with :after is rejected (Blazor RZ10019)", async () => {
    const diagnostics = await diagnosticsOf(`<Field @bind-Value:get="v" @bind-Value:set="s" @bind-Value:after="a" />`, { "Field.tsazor": field });
    expect(errorCodes(diagnostics)).toEqual(["TZS008"]);
  });
});

describe("C17 — @bind targets", () => {
  it("accepts a non-null assertion in the member path", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value="Model!.name" /><p>@Model!.name</p>
@code { private Model: { name: string } | null = { name: "" }; }`,
      "Field.tsazor": field,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("x");
  });

  it("element @bind to non-null and element-access targets", async () => {
    const m = await mount(`<input id="a" @bind="Model!.name" /><input id="b" @bind="items[i].name" /><input id="c" @bind="map[key]" /><p>@Model!.name/@items[1].name/@map.k</p>
@code { private Model: { name: string } | null = { name: "" }; private items = [{ name: "" }, { name: "" }]; private i = 1;
    private map: Record<string, string> = { k: "" }; private key = "k"; }`);
    for (const [id, value] of [["a", "m"], ["b", "n"], ["c", "o"]]) {
      const input = m.container.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value!;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await m.settle();
    }
    expect(m.container.querySelector("p")!.textContent).toBe("m/n/o");
  });

  it("rejects optional chaining — not assignable (TS2779)", async () => {
    const diagnostics = await diagnosticsOf(`<Field @bind-Value="Model?.name" />`, { "Field.tsazor": field });
    expect(errorCodes(diagnostics)).toEqual(["TZS008"]);
    expect(diagnostics.find((d) => d.code === "TZS008")!.message).toMatch(/optional chaining/);
  });

  it("A7: rejects a bind to the loop variable at compile time (C#: CS1656), accepts its members", async () => {
    const diagnostics = await diagnosticsOf(`@foreach (const item of items) { <input @bind="item" /> }
@code { private items = ["a"]; }`);
    expect(errorCodes(diagnostics)).toEqual(["TZS008"]);
    expect(diagnostics[0]!.message).toMatch(/cannot bind to the const loop variable 'item'/);
    const m = await mount(`@foreach (const item of items) { <input @bind="item.name" /> }<p>@items[0]!.name</p>
@code { private items = [{ name: "a" }]; }`);
    const input = m.container.querySelector("input")!;
    input.value = "b";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("b");
  });
});

describe("A7 — @bind-<attr> on elements (Razor element semantics)", () => {
  const change = async (m: Awaited<ReturnType<typeof mount>>, selector: string, value: string, type = "change"): Promise<void> => {
    const input = m.container.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event(type, { bubbles: true }));
    await m.settle();
  };

  it("@bind-value binds the value attribute with onchange, like @bind", async () => {
    const m = await mount(`<input id="a" @bind-value="name" /><p>@name</p>
@code { private name = "start"; }`);
    expect(m.container.querySelector<HTMLInputElement>("#a")!.value).toBe("start");
    await change(m, "#a", "typed");
    expect(m.container.querySelector("p")!.textContent).toBe("typed");
  });

  it("@bind-value:event picks the DOM event; number inputs coerce like @bind", async () => {
    const m = await mount(`<input id="a" @bind-value="text" @bind-value:event="oninput" /><input id="n" type="number" @bind-value="count" />
<p>@text/@(typeof count):@count</p>
@code { private text = ""; private count = 1; }`);
    await change(m, "#a", "live", "input");
    await change(m, "#n", "42");
    expect(m.container.querySelector("p")!.textContent).toBe("live/number:42");
  });

  it("@bind-value with :after, and :get/:set", async () => {
    const m = await mount(`<input id="a" @bind-value="v" @bind-value:after="changed" /><input id="b" @bind-value:get="w" @bind-value:set="store" />
<p>@v/@w/@log</p>
@code { private v = ""; private w = ""; private log = ""; changed() { this.log += "after:" + this.v; } store(value: string) { this.w = value.toUpperCase(); } }`);
    await change(m, "#a", "x");
    await change(m, "#b", "y");
    expect(m.container.querySelector("p")!.textContent).toBe("x/Y/after:x");
  });

  it("component @bind-Value is unchanged (Value + ValueChanged)", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value="v" /><p>@v</p>\n@code { private v = ""; }`,
      "Field.tsazor": field,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("x");
  });
});

/**
 * `@Bindable()` (Tsazor extension) — Blazor equivalence: a component with
 * `@Bindable() accessor Value` behaves exactly like the hand-written Blazor
 * pair `Value` + `ValueChanged` (whose handler invokes the callback) under
 * `@bind-Value`, `:after`, `:get`/`:set` and `:event`. Every scenario runs
 * against both forms and expects the same DOM.
 */
import { describe, expect, it } from "vitest";
import { diagnosticsOf, errorCodes, mount } from "../harness.js";

/** The Blazor form: a parameter pair, the handler awaits the callback. */
const pair = (changed = "ValueChanged") => `<button @onclick="inc">@Value</button>
@code {
    @Parameter() Value = 0;
    @Parameter() ${changed}?: EventCallback<number>;
    async inc() { await this.${changed}?.invokeAsync(this.Value + 1); }
}`;

/** The Tsazor extension: one bindable accessor, the handler assigns. */
const bindable = (changed?: string) => `<button @onclick="inc">@Value</button>
@code {
    @Bindable(${changed ? `{ changed: "${changed}" }` : ""}) accessor Value = 0;
    inc() { this.Value += 1; }
}`;

const variants = [
  ["explicit Value/ValueChanged pair (Blazor)", pair],
  ["@Bindable() accessor (Tsazor extension)", bindable],
] as const;

async function clickTwice(m: Awaited<ReturnType<typeof mount>>): Promise<void> {
  for (let i = 0; i < 2; i++) {
    m.container.querySelector("button")!.click();
    await m.settle();
  }
}

describe.each(variants)("@bind-Value equivalence — %s", (_label, stepper) => {
  it("@bind-Value: the parent's field follows, the child shows the parent's value", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value="guests" /><p>@guests</p>\n@code { private guests = 5; }`,
      "Stepper.tsazor": stepper(),
    });
    expect(m.text()).toBe("55");
    await clickTwice(m);
    expect(m.text()).toBe("77");
  });

  it("@bind-Value:after runs after the assignment, once per change", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value="guests" @bind-Value:after="changed" /><p>@log.join(",")</p>
@code { private guests = 1; private log: string[] = []; private changed() { this.log.push("after:" + this.guests); } }`,
      "Stepper.tsazor": stepper(),
    });
    await clickTwice(m);
    expect(m.text()).toBe("3after:2,after:3");
  });

  it("@bind-Value:get/:set: a normalizing setter wins over the child's value", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value:get="guests" @bind-Value:set="store" /><p>@guests</p>
@code { private guests = 1; private store(value: number) { this.guests = Math.min(value, 2); } }`,
      "Stepper.tsazor": stepper(),
    });
    await clickTwice(m);
    expect(m.text()).toBe("22");
  });

  it("@bind-Value:get/:set: a setter that rejects the value resets the child", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value:get="guests" @bind-Value:set="ignore" /><p>@guests</p>
@code { private guests = 4; private ignore(_value: number) {} }`,
      "Stepper.tsazor": stepper(),
    });
    await clickTwice(m);
    expect(m.text()).toBe("44");
  });

  it("@bind-Value:event names the change callback parameter", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value="guests" @bind-Value:event="OnPick" /><p>@guests</p>\n@code { private guests = 0; }`,
      "Stepper.tsazor": stepper("OnPick"),
    });
    await clickTwice(m);
    expect(m.text()).toBe("22");
  });

  it("a parent re-render with an unchanged value does not echo the callback", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value="guests" @bind-Value:after="changed" /><p>@calls</p>
@code { private guests = 3; private calls = 0; private changed() { this.calls++; } }`,
      "Stepper.tsazor": stepper(),
    });
    await m.rerender();
    await m.rerender();
    expect(m.text()).toBe("30");
  });
});

describe("@Bindable() — beyond the pair", () => {
  it("works unbound: the value changes locally (uncontrolled)", async () => {
    const m = await mount({ "Test.tsazor": `<Stepper />`, "Stepper.tsazor": bindable() });
    await clickTwice(m);
    expect(m.text()).toBe("2");
  });

  it("the synthesized callback is a typed member the component can await explicitly", async () => {
    const m = await mount({
      "Test.tsazor": `<Stepper @bind-Value="guests" /><p>@guests</p>\n@code { private guests = 0; }`,
      "Stepper.tsazor": `<button @onclick="jump">@Value</button>
@code {
    @Bindable() accessor Value = 0;
    async jump() { await this.ValueChanged?.invokeAsync(10); }
}`,
    });
    m.container.querySelector("button")!.click();
    await m.settle();
    expect(m.text()).toBe("1010");
  });

  it("{ expression: true } takes the bound field name (EditContext contract)", async () => {
    const m = await mount({
      "Test.tsazor": `<Field @bind-Value="model.title" />\n@code { private model = { title: "a" }; }`,
      "Field.tsazor": `<span>@ValueExpression=@Value</span>\n@code { @Bindable({ expression: true }) accessor Value = ""; }`,
    });
    expect(m.text()).toBe("title=a");
  });

  it("free names in markup resolve the synthesized member", async () => {
    const m = await mount({
      "Test.tsazor": `<Probe @bind-Value="v" />\n@code { private v = 1; }`,
      "Probe.tsazor": `<span>@(ValueChanged === undefined ? "unbound" : "bound")</span>\n@code { @Bindable() accessor Value = 0; }`,
    });
    expect(m.text()).toBe("bound");
  });

  it("an unknown bind target on a @Bindable component is still TZS025", async () => {
    const diagnostics = await diagnosticsOf(`<Stepper @bind-Count="v" />\n@code { private v = 1; }`, { "Stepper.tsazor": bindable() });
    expect(errorCodes(diagnostics)).toEqual(["TZS025", "TZS025"]);
  });

  it("@Bindable() on a plain field is TZS030 with the fix 'insert accessor'", async () => {
    const diagnostics = await diagnosticsOf(`<p>@Value</p>\n@code {\n    @Bindable() Value = 0;\n}`);
    expect(errorCodes(diagnostics)).toEqual(["TZS030"]);
    const diagnostic = diagnostics.find((d) => d.code === "TZS030")!;
    expect(diagnostic.fix?.title).toBe("Insert 'accessor'");
    expect(diagnostic.fix?.edits).toEqual([{ pos: { line: 3, column: 16 }, endPos: { line: 3, column: 16 }, text: "accessor " }]);
    expect(diagnostic.pos).toEqual({ line: 3, column: 16 });
  });
});

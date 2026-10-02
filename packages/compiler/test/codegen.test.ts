import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";
import { metadataOf, withComponents } from "./component-metadata";

function gen(source: string, options?: Parameters<typeof generateCode>[1]) {
  const diagnostics = new DiagnosticBag();
  const doc = parseDocument(source, diagnostics);
  const result = generateCode(doc, { className: "Demo", ...options }, diagnostics);
  return { code: result.code, mappings: result.mappings, metadata: result.metadata, diagnostics };
}

describe("codegen", () => {
  it("bakes bare member references across whole code spans (C# semantics in TS)", () => {
    const { code } = gen("@for (const forecast of forecasts) { <td>@forecast.date</td> }\n@if (loading && forecasts.length > 0) { <p>@model.name</p> }\n@code { private forecasts: Array<{ date: string }> = []; private model = { name: \"\" }; private loading = true; }");
    // The loop iterable resolves to the component member…
    expect(code).toContain("for (const forecast of this.forecasts) {");
    // …while the loop-local stays bare.
    expect(code).toContain("__builder.addContent(");
    expect(code).toContain("forecast.date");
    // Condition on the right side of && also bakes.
    expect(code).toContain("if (this.loading && this.forecasts.length > 0) {");
    // After-dot property access is untouched.
    expect(code).toContain("this.model.name");
  });

  it("compiles non-null assertions and optional chains inside markup expressions (regression: `!.title` rendered as literal)", () => {
    const { code } = gen(
      '<span>@this.items[i]!.title</span><p>@this.user?.name</p>' +
        '@code { private items: Array<{ title: string }> = []; private user?: { name: string }; private i = 0; }',
    );
    expect(code).toContain("this.items[this.i]!.title");
    expect(code).not.toContain('"!.title"');
    expect(code).toContain("this.user?.name");
  });

  it("bakes the contextual keyword 'type' as a member reference (regression)", () => {
    // "type" is only a contextual keyword (type aliases) and can never start
    // a keyword position inside a markup expression — but it is a very common
    // property name. Skipping it rendered a bare `type` (runtime ReferenceError).
    const { code } = gen('<button type="@type">x</button>');
    expect(code).toContain('__builder.addAttribute(1, "type", this.type);');
  });

  it("converts event-parameter values to bound EventCallbacks on component tags (Razor method-group/lambda semantics)", () => {
    // A bare `this.handler` reference loses `this` in TS; an arrow passed as a
    // plain function gets bound by the renderer to the nearest component — the
    // wrong receiver inside child-content fragments, so the authoring page
    // never re-rendered. Razor binds method groups and lambdas via the
    // EventCallbackFactory; we mirror that for all on*-named component attrs.
    const { code } = gen(
      '<Alert OnDismissed="@alertGone" OnClick="@poke" OnSelect="@(() => this.picked())" Variant="@variant">x</Alert>' +
        '@code { private alertGone(): void {} private poke(): void {} private picked(): void {} private variant = ""; }',
      { resolveComponent: (tag) => (tag === "Alert" ? { specifier: "./Alert.tsazor" } : null) },
    );
    expect(code).toContain('__builder.addAttribute(1, "OnDismissed", __tsazor_EventCallback.bind(this, this.alertGone));');
    expect(code).toContain('__builder.addAttribute(2, "OnClick", __tsazor_EventCallback.bind(this, this.poke));');
    expect(code).toContain('__builder.addAttribute(3, "OnSelect", __tsazor_EventCallback.bind(this, () => this.picked()));');
    // Non-event attribute values stay plain (e.g. string/number fields).
    expect(code).toContain('__builder.addAttribute(4, "Variant", this.variant);');
  });

  it("leaves element attribute expressions unwrapped (only component tags get the EventCallback conversion)", () => {
    const { code } = gen('<a href="@target" data-on="x">y</a>@code { private target = "/"; }');
    expect(code).toContain('__builder.addAttribute(1, "href", this.target);');
  });

  it("decodes HTML entities in text, static attributes and mixed attribute values (Razor parse-time decoding)", () => {
    const { code } = gen(
      '<h2>Tabs &amp; Accordion</h2><div title="A &amp; B" data-note="&#8212;">&notanentity;</div>' +
        '<span title="Zählen &amp; @expr">y</span>@code { private expr = 1; }',
    );
    expect(code).toContain('__builder.addContent(1, "Tabs & Accordion");');
    expect(code).toContain('__builder.addContent(1, "Tabs & Accordion");');
    expect(code).toContain('__builder.addAttribute(3, "title", "A & B");');
    expect(code).toContain('__builder.addAttribute(4, "data-note", "—");');
    // Unknown entities stay literal, matching HTML parsing.
    expect(code).toContain('__builder.addContent(5, "&notanentity;");');
    // Mixed attribute value: literal parts decode, expression parts untouched.
    expect(code).toContain('`Zählen & ${(this.expr) ?? ""}`');
  });

  it("emits builder calls with monotone sequences", () => {
    const { code } = gen("<h1>@Title</h1><button class='btn'>Go</button>");
    expect(code).toContain('__builder.openElement(0, "h1");');
    expect(code).toContain("__builder.addContent(1, this.Title);");
    expect(code).toContain('__builder.openElement(2, "button");');
    expect(code).toContain('__builder.addAttribute(3, "class", "btn");');
    expect(code).toContain("__builder.closeElement();");
    expect(code).toContain("export default class Demo extends __tsazor_ComponentBase {");
  });

  it("imports only used runtime APIs", () => {
    const { code } = gen("<p>@x</p>");
    expect(code).toContain('import { ComponentBase, RenderTreeBuilder, ComponentBase as __tsazor_ComponentBase, RenderTreeBuilder as __tsazor_RenderTreeBuilder } from "@tsazor/runtime";');
    const { code: code2 } = gen('<button @onclick="Go">x</button>');
    expect(code2).toContain("EventCallback");
    expect(code2).toContain('__builder.addEventHandler(1, "onclick", __tsazor_EventCallback.bind(this, this.Go));');
  });

  it("resolves component tags to imports and emits ChildContent", () => {
    const { code } = gen("<Greeter Name='World'><p>child</p></Greeter>", {
      resolveComponent: (tag) => (tag === "Greeter" ? { specifier: "./Greeter.tsazor" } : null),
    });
    expect(code).toContain('import __tsazor_comp_Greeter from "./Greeter.tsazor";');
    expect(code).toContain("__builder.openComponent(0, __tsazor_comp_Greeter);");
    expect(code).toContain('__builder.addAttribute(1, "Name", "World");');
    expect(code).toContain('__builder.addContent(2, (__builder) => {');
    expect(code).toContain('__builder.closeComponent();');
  });

  it("unresolved components fall back to elements with a warning", () => {
    const { diagnostics, code } = gen("<UnknownTag />");
    expect(diagnostics.all.some((d) => d.code === "TZS005" && d.severity === "warning")).toBe(true);
    expect(code).toContain('__builder.openElement(0, "UnknownTag");');
    expect(code).not.toContain("openComponent");
  });

  it("emits routeTemplate and inject from directives", () => {
    const { code, metadata } = gen('@page "/users"\n@inject UserService Users\n', {
      resolveType: (name) => (name === "UserService" ? { specifier: "./services" } : null),
    });
    expect(code).toContain('export const routeTemplate = "/users";');
    expect(code).toContain("static routeTemplate = routeTemplate;");
    expect(code).toContain("private readonly Users = __tsazor_inject(UserService);");
    expect(code).toContain('import UserService from "./services";');
    expect(metadata.routeTemplate).toBe("/users");
    expect(metadata.injects).toEqual([{ type: "UserService", name: "Users" }]);
  });

  it("emits routeAuthorize for a bare @authorize directive", () => {
    const { code, metadata } = gen('@page "/myorders"\n@authorize\n<p>protected</p>\n');
    expect(metadata.authorize).toBe(true);
    expect(code).toContain("export const routeAuthorize = true;");
    expect(code).toContain("static routeAuthorize = routeAuthorize;");
    // Without @authorize nothing is emitted.
    const { code: plain } = gen('@page "/open"\n<p>public</p>\n');
    expect(plain).not.toContain("routeAuthorize");
  });

  it("emits setKey and element reference captures", () => {
    const { code } = gen('<li @key="item.Id" @ref="listItem">x</li>');
    expect(code).toContain("__builder.setKey(this.item.Id);");
    expect(code).toContain("__builder.addElementReferenceCapture(1, (el) => { this.listItem = el; });");
  });

  it("emits if/else chains inside buildRenderTree", () => {
    const { code } = gen("@if (a) { <p>yes</p> } else { <p>no</p> }");
    expect(code).toContain("if (this.a) {");
    expect(code).toContain("else {");
  });

  it("emits foreach as for-of with fragment-safe sequences", () => {
    const { code, diagnostics } = gen("@foreach (const item of items) { <li>@item</li> }");
    expect(diagnostics.all).toEqual([]);
    expect(code).toContain("for (const item of this.items) {");
  });

  it("emits switch sections flat, with their own breaks", () => {
    const { code, diagnostics } = gen('@switch (v) { case "a": <p>a</p> break; default: <p>d</p> break; }');
    expect(diagnostics.all).toEqual([]);
    expect(code).toContain('case "a":\n');
    expect(code).toContain("default:\n");
    expect(code.match(/break;/g)?.length).toBe(2);
  });

  it("produces sourcemap entries mapping builder calls back to source", () => {
    const { mappings } = gen('<p>@Title</p>');
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings[0]!.srcLine).toBe(0);
  });

  it("emits token-precise mappings for identifiers inside markup expressions", () => {
    // `<p>@Title.name</p>`: @ at col 3 → implicit code base 1. `Title` bakes to
    // `this.` + token — its entry anchors at its own generated token (5 chars
    // after the baked prefix's start), `name` is an after-dot access mapping at
    // its own source column.
    const { mappings } = gen('<p>@Title.name</p>');
    const onLine0 = mappings.filter((m) => m.srcLine === 0);
    expect(onLine0.some((m) => m.genCol === 4 && m.srcCol === 3)).toBe(true);  // statement start (@)
    // Baked expression starts at statement-text offset 24 (`    __builder.addContent(1, `);
    // entries are anchored in statement text coordinates + token landing offset.
    expect(onLine0.some((m) => m.genCol === 33 && m.srcCol === 4)).toBe(true);  // `Title` (position inside this.Title)
    expect(onLine0.some((m) => m.genCol === 39 && m.srcCol === 10)).toBe(true); // `name` (11 after "this.Title.")
  });

  it("maps parenthesized expressions with inner-whitespace padding", () => {
    // `<p>@( count + 1 )</p>`: base 2 for `@(` + 1 for the inner space → `count`
    // lands exactly on its source column 6.
    const { mappings } = gen("<p>@( count + 1 )</p>");
    const entry = mappings.find((m) => m.srcLine === 0 && m.srcCol === 6);
    expect(entry).toBeDefined();
  });

  it("anchors component tags, attribute value expressions and refs token-precise (hover/def)", () => {
    // Acceptance regression (LSP v2): hover on `<AddressEditor Address="@this.…"
    // />` used to land on the *closeComponent* line — open/close shared the
    // node.pos anchor and attribute values had no token entries at all.
    const source = '<AddressEditor Address="@this.order.deliveryAddress" />';
    const { code, mappings } = gen(source, {
      resolveComponent: (tag) => (tag === "AddressEditor" ? { specifier: "./AddressEditor.tsazor" } : null),
    });
    const lineOf = (needle: string): number => {
      const idx = code.split("\n").findIndex((l) => l.includes(needle));
      expect(idx).toBeGreaterThanOrEqual(0);
      return idx + 1; // genLine is 1-based
    };

    // Open-tag line: statement anchor at `<` + precise tag-token entry (srcCol 1).
    const openMaps = mappings.filter((m) => m.genLine === lineOf("__builder.openComponent("));
    expect(openMaps.some((m) => m.genCol === 4 && m.srcCol === 0)).toBe(true);
    expect(openMaps.some((m) => m.genCol > 4 && m.srcCol === 1)).toBe(true);

    // Attribute line: anchor at the attribute name + precise expression tokens
    // (`@this.order.deliveryAddress` → cols 10 / 15 / 21 relative to the name).
    const attrMaps = mappings.filter((m) => m.genLine === lineOf("__builder.addAttribute(1,"));
    expect(attrMaps.some((m) => m.genCol === 4 && m.srcCol === 15)).toBe(true);
    expect(attrMaps.some((m) => m.srcCol === 25)).toBe(true); // `this`
    expect(attrMaps.some((m) => m.srcCol === 30)).toBe(true); // `order`
    expect(attrMaps.some((m) => m.srcCol === 36)).toBe(true); // `deliveryAddress`

    // closeComponent: unmapped plumbing — lookups from source can never land on it.
    expect(mappings.filter((m) => m.genLine === lineOf("__builder.closeComponent();")).length).toBe(0);
  });

  it("anchors element tags and leaves closeElement unmapped", () => {
    const { code, mappings } = gen("<div class=\"x\">y</div>");
    const openMaps = mappings.filter((m) => m.genLine === code.split("\n").findIndex((l) => l.includes('__builder.openElement(')) + 1);
    expect(openMaps.some((m) => m.genCol === 4 && m.srcCol === 0)).toBe(true);
    expect(openMaps.some((m) => m.genCol > 4 && m.srcCol === 1)).toBe(true); // tag name inside the literal
    expect(mappings.filter((m) => m.genLine === code.split("\n").findIndex((l) => l.includes("__builder.closeElement();")) + 1).length).toBe(0);
  });

  it("keeps control headers at statement-level granularity (no token entries)", () => {
    // Control statements get no srcBase — only markup expressions do. The
    // `@if` header maps to its '@' (and the closing brace to node.pos); if a
    // token-precise base leaked in, `bVisible`'s srcCol would appear twice.
    const { mappings } = gen("@if (bVisible) { <p>@bVisible</p> }@code { private bVisible = true; }");
    expect(mappings.some((m) => m.srcLine === 0 && m.srcCol === 0)).toBe(true);  // if-header statement
    expect(mappings.filter((m) => m.srcLine === 0 && m.srcCol === 5).length).toBe(0); // no leak at header token
  });

  it("wraps @code members and re-emits verbatim", () => {
    const { code } = gen("@code {\n  count = 0;\n}");
    expect(code).toContain("  count = 0;");
    expect(code).toContain("export default class Demo extends __tsazor_ComponentBase {");
  });

  it("emits @bind as value attribute + change handler", () => {
    const { code } = gen('<input @bind="name" />');
    expect(code).toContain('__builder.addAttribute(1, "value", this.name);');
    expect(code).toContain(
      '__builder.addEventHandler(2, "onchange", __tsazor_EventCallback.bind(this, (__event) => { this.name = (__event.target as HTMLInputElement).value; }));',
    );
  });

  it("honors @bind:event and input-type extraction", () => {
    const { code } = gen('<input @bind="count" @bind:event="oninput" type="number" />');
    expect(code).toContain('__builder.addEventHandler(2, "oninput", __tsazor_EventCallback.bind(this, (__event) => {');
    expect(code).toContain("Number((__event.target as HTMLInputElement).value)");

    const { code: checkbox } = gen('<input @bind="enabled" type="checkbox" />');
    expect(checkbox).toContain('__builder.addAttribute(1, "checked", this.enabled);');
    expect(checkbox).toContain("(__event.target as HTMLInputElement).checked");
  });

  it("emits @bind:get/:set and @bind:after, and warns on @bind:format", () => {
    const { code, diagnostics } = gen('<input @bind:get="display" @bind:set="store" @bind:format="yyyy" />');
    expect(code).toContain('__builder.addAttribute(1, "value", this.display);');
    expect(code).toContain("async (__event) => { await (this.store)((__event.target as HTMLInputElement).value); }");
    expect(diagnostics.all.some((d) => d.code === "TZS008" && d.severity === "warning")).toBe(true);
    expect(diagnostics.hasErrors).toBe(false);

    const after = gen('<input @bind="name" @bind:after="done" />');
    expect(after.code).toContain("async (__event) => { this.name = (__event.target as HTMLInputElement).value; await this.done(); }");
  });

  it("enforces Blazor's @bind modifier combinations (RZ10004, RZ10015-RZ10019)", () => {
    const errors = (source: string) => gen(source).diagnostics.errors.map((d) => d.message);
    expect(errors('<input @bind="a" @bind:get="b" @bind:set="c" />')).toEqual([expect.stringContaining("can't be used together with '@bind:get'")]);
    expect(errors('<input @bind:get="a" />')).toEqual([expect.stringContaining("must be used with '@bind:set'")]);
    expect(errors('<input @bind:set="a" />')).toEqual([expect.stringContaining("no '@bind:get' was found")]);
    expect(errors('<input @bind:get="a" @bind:set="b" @bind:after="c" />')).toEqual([expect.stringContaining("can't be used with '@bind:set'")]);
    expect(errors('<input @bind:after="c" />')).toEqual([expect.stringContaining("no '@bind' was found")]);
    // Attribute order does not matter.
    expect(errors('<input @bind:after="done" @bind="name" />')).toEqual([]);
  });

  it("emits @bind:format on number/date inputs as formatValue/parseValue (3.7)", () => {
    const { code } = gen('<input type="number" @bind="amount" @bind:format="0.00" />');
    expect(code).toContain('__builder.addAttribute(2, "value", __tsazor_formatValue(this.amount, "0.00"));');
    // The direct-assign path casts like the :set path (`as never`) — the parsed
    // change value is `string | number | Date`, the model field need not be
    // (4.2 regression: demo FormatDemo failed its tsazor check without it).
    expect(code).toContain(
      '__builder.addEventHandler(3, "onchange", __tsazor_EventCallback.bind(this, (__event) => { this.amount = (__tsazor_parseValue((__event.target as HTMLInputElement).value, "0.00") ?? this.amount) as never; }));',
    );

    const { code: date } = gen('<input type="date" @bind="day" @bind:format="yyyy-MM-dd" />');
    expect(date).toContain('__builder.addAttribute(2, "value", __tsazor_formatValue(this.day, "yyyy-MM-dd"));');
    expect(date).toContain('__tsazor_parseValue((__event.target as HTMLInputElement).value, "yyyy-MM-dd") ?? this.day) as never;');

    // The F/N fixed/grouped and digit-mask formats all take the parse path.
    expect(gen('<input type="number" @bind="amount" @bind:format="N2" />').code).toContain(
      '__tsazor_parseValue((__event.target as HTMLInputElement).value, "N2") ?? this.amount) as never;',
    );
    // A plain format value is a string literal only; an @expression stays a member reference.
    expect(gen('<input type="date" @bind="day" @bind:format="@fmt" />').code).toContain('__tsazor_formatValue(this.day, this.fmt));');
  });

  it("routes a formatted @bind:get/:set through parseValue with Blazor's TryParse skip", () => {
    const { code, diagnostics } = gen('<input type="date" @bind:get="display" @bind:set="store" @bind:format="yyyy" />');
    expect(code).toContain('__builder.addAttribute(2, "value", __tsazor_formatValue(this.display, "yyyy"));');
    expect(code).toContain("await ((__tsazor_parsed: unknown) => __tsazor_parsed !== null ? (this.store)(__tsazor_parsed as never) : undefined)(__tsazor_parseValue((__event.target as HTMLInputElement).value, \"yyyy\"));");
    // A date input with a format is in the supported subset: no warning.
    expect(diagnostics.all.some((d) => d.code === "TZS008")).toBe(false);
  });

  it("keeps the native round trip for binds without a supported type and warns (3.7)", () => {
    const { code, diagnostics } = gen('<input @bind="name" @bind:format="0.00" />');
    // String binds carry no format (Blazor's BindConverter) — plain emission.
    expect(code).toContain('__builder.addAttribute(1, "value", this.name);');
    expect(code).toContain('this.name = (__event.target as HTMLInputElement).value;');
    expect(code).not.toContain("formatValue");
    expect(diagnostics.all.some((d) => d.code === "TZS008" && d.severity === "warning")).toBe(true);
    expect(diagnostics.hasErrors).toBe(false);

    // Unformatted number/date binds keep the existing native coercion.
    const { code: number } = gen('<input type="number" @bind="amount" />');
    expect(number).toContain("Number((__event.target as HTMLInputElement).value)");
  });

  it("coerces a range input like a number input (Blazor's BindInputElement range)", () => {
    const { code } = gen('<input type="range" @bind="volume" />');
    expect(code).toContain(
      'this.volume = (__event.target as HTMLInputElement).value.trim() === "" || Number.isNaN(Number((__event.target as HTMLInputElement).value)) ? this.volume : Number((__event.target as HTMLInputElement).value);',
    );
    // `@bind:format` applies to it like to a number input (no TZS008 warning).
    const formatted = gen('<input type="range" @bind="volume" @bind:format="F1" />');
    expect(formatted.code).toContain('__tsazor_formatValue(this.volume, "F1")');
    expect(formatted.diagnostics.all.some((d) => d.code === "TZS008")).toBe(false);
  });

  it("binds a date input through Blazor's default yyyy-MM-dd format", () => {
    // Blazor: BindInputElement("date", …, format: "yyyy-MM-dd") — the input's
    // value is always ISO; a raw Date would render as String(date) (empty input).
    const { code } = gen('<input type="date" @bind="day" />');
    expect(code).toContain('__builder.addAttribute(2, "value", __tsazor_formatValue(this.day, "yyyy-MM-dd"));');
    expect(code).toContain('this.day = (__tsazor_parseValue((__event.target as HTMLInputElement).value, "yyyy-MM-dd") ?? this.day) as never;');
    expect(code).not.toContain("new Date(");
  });

  it("rejects @bind:culture with the invariant-culture decision (TZS008 error)", () => {
    const errors = (source: string) => gen(source).diagnostics.errors.map((d) => d.message);
    expect(errors('<input type="date" @bind="day" @bind:culture="de-DE" />')).toEqual([expect.stringContaining("invariant culture only")]);
    expect(errors('<input @bind-value="x" @bind-value:culture="fr-FR" />')).toEqual([expect.stringContaining("invariant culture only")]);
    expect(errors('<Stepper @bind-Value="v" @bind-Value:culture="de" />')).toEqual([expect.stringContaining("invariant culture only")]);
  });

  /** A bindable input component that declares ValueExpression (like InputBase). */
  const input = (name: string) => metadataOf(name, { Value: "value", ValueChanged: "EventCallback<T>", ValueExpression: "string" });

  it("emits @bind-Value on components as Value + ValueExpression + ValueChanged", () => {
    const { code } = gen('<Stepper @bind-Value="current" />', withComponents({ Stepper: input("Stepper") }));
    expect(code).toContain('__builder.addAttribute(1, "Value", this.current);');
    expect(code).toContain('__builder.addAttribute(2, "ValueExpression", "current");');
    expect(code).toContain('__builder.addAttribute(3, "ValueChanged", __tsazor_EventCallback.bind(this, (__value) => { this.current = __value; }));');
  });

  it("treats plain @bind on a component tag as Value + ValueChanged", () => {
    const { code } = gen('<InputText @bind="name" />', {
      resolveComponent: (tag) => (tag === "InputText" ? { specifier: "@tsazor/runtime", exportName: "InputText" } : null),
      resolveComponentMetadata: () => input("InputText"),
    });
    expect(code).toContain('__builder.addAttribute(1, "Value", this.name);');
    expect(code).toContain('__builder.addAttribute(2, "ValueExpression", "name");');
    expect(code).toContain('__builder.addAttribute(3, "ValueChanged", __tsazor_EventCallback.bind(this, (__value) => { this.name = __value; }));');
  });

  it("derives ValueExpression from member paths (@bind=\"this.model.name\" → \"name\")", () => {
    const { code } = gen('<TextInput @bind="this.model.name" />', {
      resolveComponent: (tag) => (tag === "TextInput" ? { specifier: "@tsazor/fluent", exportName: "TextInput" } : null),
      resolveComponentMetadata: () => input("TextInput"),
    });
    expect(code).toContain('__builder.addAttribute(1, "Value", this.model.name);');
    expect(code).toContain('__builder.addAttribute(2, "ValueExpression", "name");');
  });

  it("emits <Target>Expression only when the component declares it (from :get too, as Blazor)", () => {
    const { code } = gen('<Selected @bind-Selected="pick" />', withComponents({ Selected: metadataOf("Selected", { Selected: "value", SelectedChanged: "EventCallback<T>" }) }));
    expect(code).not.toContain("Expression");
    const declared = gen('<Selected @bind-Selected="pick" />', withComponents({ Selected: metadataOf("Selected", { selected: "value", selectedChanged: "EventCallback<T>", selectedExpression: "string" }) }));
    expect(declared.code).toContain('__builder.addAttribute(2, "selectedExpression", "pick");');
    // Undeclared: not emitted (it would be an unknown parameter at runtime).
    const stepper = gen('<Stepper @bind-Value="v" />', withComponents({ Stepper: metadataOf("Stepper", { Value: "value", ValueChanged: "EventCallback<T>" }) }));
    expect(stepper.code).not.toContain("ValueExpression");
    // Unknown parameters (no metadata): not emitted either.
    expect(gen('<Stepper @bind-Value="v" />', withComponents({ Stepper: null })).code).not.toContain("ValueExpression");
    const custom = gen('<InputText @bind:get="this.pick" @bind:set="(v) => this.pick = v" />', {
      resolveComponent: (tag) => (tag === "InputText" ? { specifier: "@tsazor/runtime", exportName: "InputText" } : null),
      resolveComponentMetadata: () => input("InputText"),
    });
    expect(custom.code).toContain('__builder.addAttribute(2, "ValueExpression", "pick");');
    expect(custom.code).toContain("async (__value) => { await ((v) => this.pick = v)(__value); }");
  });

  it("keeps plain @bind on elements as value + change handler", () => {
    const { code } = gen('<input @bind="name" />');
    expect(code).toContain('__builder.addAttribute(1, "value", this.name);');
    expect(code).toContain("addEventHandler");
    expect(code).not.toContain('"ValueChanged"');
  });

  it("emits the scope attribute first on plain elements when scopeHash is set", () => {
    const { code: scoped, metadata } = gen('<input @bind="name" />', { scopeHash: "b-1a2b3c4d" });
    // The scope attribute is the first frame after openElement...
    expect(scoped).toContain('__builder.addAttribute(1, "b-1a2b3c4d", "");');
    // ...and subsequent frames shift by one sequence number.
    expect(scoped).toContain('__builder.addAttribute(2, "value", this.name);');
    expect(metadata.scopeHash).toBe("b-1a2b3c4d");
  });

  it("scopes every plain element (including child fragments) but not component tags", () => {
    const { code } = gen(
      '<div><Alert><span>child markup</span></Alert><button>ok</button></div>',
      {
        scopeHash: "b-7f3e00aa",
        resolveComponent: (tag) => (tag === "Alert" ? { specifier: "./Alert.tsazor" } : null),
      },
    );
    expect(code.match(/__builder\.addAttribute\(\d+, "b-7f3e00aa", ""\)/g)?.length).toBe(3); // outer div, child span, button
    expect(code).toMatch(/__builder\.openComponent\(\d+, __tsazor_comp_Alert\);/); // component tag itself gets no scope frame
  });

  it("leaves emission byte-identical when scopeHash is unset (regression guard)", () => {
    // Without the option, no scope frames and unchanged sequence numbers —
    // this is what keeps the existing hard-coded-sequence tests stable.
    const { code } = gen('<input @bind="name" />');
    expect(code).toContain('__builder.addAttribute(1, "value", this.name);');
    expect(code).not.toContain('__builder.addAttribute(1, "b-');
  });

  it("extends the code-behind class instead of ComponentBase when codeBehindClass is set", () => {
    const { code, metadata } = gen('<p>@count</p>', { codeBehindClass: "DemoBase" });
    expect(code).toContain("export default class Demo extends DemoBase {");
    expect(code).not.toContain("extends ComponentBase");
    expect(metadata.codeBehindClass).toBe("DemoBase");
  });

  it("code-behind wins over @inherits and warns (TZS011)", () => {
    const { code, diagnostics } = gen("@inherits LayoutComponentBase\n<p>hi</p>", { codeBehindClass: "DemoBase" });
    expect(code).toContain("export default class Demo extends DemoBase {");
    const warning = diagnostics.all.find((d) => d.code === "TZS011");
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
  });

  it("leaves emission byte-identical when codeBehindClass is unset (regression guard)", () => {
    const { code } = gen("@inherits LayoutComponentBase\n<div class=\"card\"><p>@Body</p></div>", {
      resolveType: (name) => (name === "LayoutComponentBase" ? { specifier: "@tsazor/runtime", exportName: "LayoutComponentBase" } : null),
    });
    expect(code).toContain("export default class Demo extends LayoutComponentBase {");
    expect(code).not.toContain("DemoBase");
  });
});

describe("codegen — code-first code contexts (A2)", () => {
  it("emits @{ } statements unwrapped so their locals reach later markup", () => {
    const { code } = gen("@{ const g = greeting + 1; }<p>@g</p>");
    expect(code).toContain("    const g = this.greeting + 1;\n");
    expect(code).toContain("__builder.addContent(1, g);");
    expect(code).not.toMatch(/^\s*\{\s*$/m);
  });

  it("scopes locals of control bodies to the body", () => {
    const { code } = gen("@if (a) {\n  const inner = 2;\n  <i>@inner</i>\n}\n<b>@inner</b>");
    expect(code).toContain("__builder.addContent(1, inner);");
    expect(code).toContain("__builder.addContent(3, this.inner);");
  });

  it("registers catch parameters and foreach variables (also destructured) as locals", () => {
    const { code, diagnostics } = gen(
      "@try { <p/> } catch (err) { <p>@err</p> }\n@foreach (const s of xs) { <i>@s</i> }\n@foreach (const [k, v] of pairs) { <i>@k@v</i> }",
    );
    expect(diagnostics.all).toEqual([]);
    expect(code).toContain("} catch (err) {");
    expect(code).toContain("__builder.addContent(2, err);");
    expect(code).toContain("for (const s of this.xs) {");
    expect(code).toContain("for (const [k, v] of this.pairs) {");
    expect(code).toContain("__builder.addContent(6, k);");
  });

  it("C# foreach headers are TZS021 naming the TS form, compiled as that form for recovery", () => {
    const { code, diagnostics } = gen(
      "@foreach (var x in xs) { <i>@x</i> }\n@foreach (string s in names) { <i>@s</i> }\n@foreach (var (k, v) in pairs) { <i>@k@v</i> }",
    );
    // The range is the whole `@foreach (…)` header (A7).
    expect(diagnostics.all.map((d) => [d.code, d.severity, d.pos])).toEqual([
      ["TZS021", "error", { line: 1, column: 0 }],
      ["TZS021", "error", { line: 2, column: 0 }],
      ["TZS021", "error", { line: 3, column: 0 }],
    ]);
    expect(diagnostics.all.map((d) => d.message.replace("C# form — use the TypeScript form. ", ""))).toEqual([
      "Use '@foreach (const x of xs)' — in TypeScript, for…in iterates keys.",
      "Use '@foreach (const s of names)' — in TypeScript, for…in iterates keys.",
      "Use '@foreach (const [k, v] of pairs)' — in TypeScript, for…in iterates keys.",
    ]);
    expect(code).toContain("for (const x of this.xs) {");
    expect(code).toContain("for (const [k, v] of this.pairs) {");
    expect(code).toContain("__builder.addContent(5, k);");
  });

  it("@foreach takes TS for…in (keys) and let/destructuring heads as written", () => {
    const { code, diagnostics } = gen(
      "@foreach (const key in obj) { <i>@key</i> }\n@foreach (let { a, b } of rows) { <i>@a@b</i> }",
    );
    expect(diagnostics.all).toEqual([]);
    expect(code).toContain("for (const key in this.obj) {");
    expect(code).toContain("__builder.addContent(1, key);");
    expect(code).toContain("for (let { a, b } of this.rows) {");
    expect(code).toContain("__builder.addContent(3, a);");
  });

  it("reports a counting or invalid @foreach header (TZS015)", () => {
    expect(gen("@foreach (let i = 0; i < 3; i++) { <i/> }").diagnostics.errors.map((d) => [d.code, d.message])).toEqual([
      ["TZS015", "Invalid TypeScript in code block. @foreach takes a for…of header ('const x of xs') — use @for for a counting loop."],
    ]);
    expect(gen("@foreach (items) { <i/> }").diagnostics.errors.map((d) => d.code)).toEqual(["TZS015"]);
  });

  it("emits while and do-while loops", () => {
    const { code } = gen("@while (n < 3) { <i>@n</i> n++; }\n@do { <b/> } while (more);");
    expect(code).toContain("while (this.n < 3) {");
    expect(code).toContain("this.n++;");
    expect(code).toContain("do {");
    expect(code).toContain("} while (this.more);");
  });

  it("lets stacked switch labels fall through and adds no implicit break", () => {
    const { code, diagnostics } = gen("@switch (k) {\n  case 1:\n  case 2:\n    <p>low</p>\n    break;\n  default:\n    <p>x</p>\n}");
    expect(diagnostics.all).toEqual([]);
    expect(code).toContain("    case 1:\n    case 2:\n");
    expect(code.match(/break;/g)?.length).toBe(1);
  });

  it("warns (TZS023) about a non-empty section that falls through, as noFallthroughCasesInSwitch", () => {
    const { code, diagnostics } = gen("@switch (k) {\n  case 1:\n    <p>one</p>\n  case 2:\n    <p>two</p>\n    break;\n  default:\n    <p>x</p>\n}");
    expect(diagnostics.all.map((d) => [d.code, d.severity, d.pos, d.message])).toEqual([
      ["TZS023", "warning", { line: 2, column: 2 }, "Switch case falls through. 'case 1:' falls through to the next case (TypeScript has no implicit break) — end it with 'break;'."],
    ]);
    expect(code.match(/break;/g)?.length).toBe(1);
    // A jump in a trailing block or in every if/else branch ends the section.
    expect(gen("@switch (k) {\n  case 1: {\n    <p/>\n    break;\n  }\n  case 2:\n    if (a) { return; } else { throw e; }\n  default:\n    <p/>\n}").diagnostics.all).toEqual([]);
    expect(gen("@switch (k) {\n  case 1:\n    if (a) { break; }\n  default:\n    <p/>\n}").diagnostics.all.map((d) => d.code)).toEqual(["TZS023"]);
  });

  it("warns (TZS022) about var in render code and keeps it as written", () => {
    const { code, diagnostics } = gen("@{ var a = 1; }\n@for (var i = 0; i < n; i++) { <p>@i</p> }\n<b>@i</b>");
    expect(diagnostics.all.map((d) => [d.code, d.severity, d.pos])).toEqual([
      ["TZS022", "warning", { line: 1, column: 3 }],
      ["TZS022", "warning", { line: 2, column: 6 }],
    ]);
    expect(code).toContain("var a = 1;");
    expect(code).toContain("for (var i = 0; i < this.n; i++) {");
    // Function-scoped: the loop variable is still a local after the loop.
    expect(code).toContain("__builder.addContent(3, i);");
  });

  it("emits no whitespace text frames for single-line bodies (Razor: code-context whitespace)", () => {
    const { code } = gen("<ul>@foreach (const x of xs) { <li>@x</li> }</ul>");
    expect(code).not.toContain('__builder.addContent(1, " ")');
    // Sequence numbers stay compile-time and source-ordered.
    expect(code).toContain('__builder.openElement(1, "li");');
    expect(code).toContain("__builder.addContent(2, x);");
  });

  it("passes minimized attributes as true (Razor)", () => {
    const { code } = gen("<input type=checkbox disabled>");
    expect(code).toContain('__builder.addAttribute(1, "type", "checkbox");');
    expect(code).toContain('__builder.addAttribute(2, "disabled", true);');
  });

  it("maps continuation lines of multi-line control headers (A1 follow-up)", () => {
    const { code, mappings } = gen("@if (a &&\n    b) {\n    <i>x</i>\n}");
    const genLine = code.split("\n").findIndex((l) => l.trim() === "this.b) {") + 1;
    expect(genLine).toBeGreaterThan(0);
    expect(mappings.some((m) => m.genLine === genLine && m.srcLine === 1 && m.srcCol === 4)).toBe(true);
  });
});

describe("codegen — directives (A2)", () => {
  it("collects every @page template (routeTemplates) and keeps the first as routeTemplate", () => {
    const { code, metadata } = gen('@page "/"\n@page "/home"\n<p>x</p>');
    expect(metadata.routeTemplate).toBe("/");
    expect(metadata.routeTemplates).toEqual(["/", "/home"]);
    expect(code).toContain('export const routeTemplates = ["/","/home"];');
    expect(code).toContain("static routeTemplates = routeTemplates;");
    // A single @page keeps its previous emission.
    expect(gen('@page "/one"\n').code).not.toContain("routeTemplates");
  });

  it("ignores Blazor-only directives (warning only where they would change semantics)", () => {
    const { code, diagnostics } = gen("@namespace A.B\n@implements IDisposable\n@rendermode InteractiveServer\n<p>x</p>");
    expect(code).not.toContain("A.B");
    expect(code).not.toContain("IDisposable");
    expect(diagnostics.hasErrors).toBe(false);
    expect(diagnostics.all.map((d) => d.code)).toEqual(["TZS014"]);
  });

  it("reports a C# @typeparam constraint (TZS021) and keeps the TS form", () => {
    const csharp = gen("@typeparam TItem where TItem : class\n");
    expect(csharp.code).toContain("export default class Demo<TItem> extends __tsazor_ComponentBase {");
    expect(csharp.diagnostics.all.map((d) => [d.code, d.severity, d.message])).toEqual([
      ["TZS021", "error", "C# form — use the TypeScript form. C# constraint 'where TItem : class' — use '@typeparam TItem extends X' (TypeScript constraints are types)."],
    ]);
    expect(gen("@typeparam TItem where TItem : IItem\n").diagnostics.errors[0]!.message).toContain("use '@typeparam TItem extends IItem'");
    const tsForm = gen("@typeparam T extends string\n");
    expect(tsForm.code).toContain("export default class Demo<T extends string> extends __tsazor_ComponentBase {");
    expect(tsForm.diagnostics.all).toHaveLength(0);
  });
});

describe("codegen — @import (A3)", () => {
  it("emits every TS import form verbatim and treats the bindings as free names", () => {
    const { code, diagnostics, metadata } = gen(
      [
        '@import { Status, formatDate as fmt } from "./utils"',
        '@import Api, { MAX_ITEMS } from "./api"',
        '@import * as icons from "./icons"',
        '@import type { Order } from "./models"',
        '@import "./theme.css"',
        "<p>@Status.Open @fmt(when) @MAX_ITEMS @icons.star @Api.base @count</p>",
      ].join("\n"),
    );
    expect(diagnostics.all).toHaveLength(0);
    expect(code).toContain('import { Status, formatDate as fmt } from "./utils";');
    expect(code).toContain('import Api, { MAX_ITEMS } from "./api";');
    expect(code).toContain('import * as icons from "./icons";');
    expect(code).toContain('import type { Order } from "./models";');
    expect(code).toContain('import "./theme.css";');
    // Imported names stay bare, members are still baked (I2).
    expect(code).toContain("Status.Open");
    expect(code).not.toContain("this.Status");
    expect(code).toContain("fmt(this.when)");
    expect(code).not.toContain("this.MAX_ITEMS");
    expect(code).not.toContain("this.icons");
    expect(code).not.toContain("this.Api");
    expect(code).toContain("this.count");
    expect(metadata.imports.map((info) => info.specifier)).toEqual(["./utils", "./api", "./icons", "./models", "./theme.css"]);
    expect(metadata.imports[3]!.bindings).toEqual([{ local: "Order", imported: "Order", typeOnly: true }]);
  });

  it("parses multi-line @import values and maps them back onto the directive", () => {
    const source = '@import {\n    Status,\n    formatDate,\n} from "./utils"\n<p>@formatDate(Status.Open)</p>';
    const { code, mappings, diagnostics } = gen(source);
    expect(diagnostics.all).toHaveLength(0);
    expect(code).toContain('import {\n    Status,\n    formatDate,\n} from "./utils";');
    expect(code).toContain("formatDate(Status.Open)");
    const genLine = code.split("\n").findIndex((line) => line === "    Status,") + 1;
    expect(mappings.some((m) => m.genLine === genLine && m.srcLine === 1)).toBe(true);
  });

  it("reports invalid @import forms (TZS016)", () => {
    for (const bad of ['@import { X from "./x"', "@import X", '@import x = require("y")', "@import", '@import { X } from "./x"; const y = 1']) {
      const { diagnostics } = gen(`${bad}\n<p>x</p>`);
      expect(diagnostics.all.map((d) => d.code), bad).toContain("TZS016");
    }
  });

  it("merges inherited imports: own bindings win, repeats are dropped", () => {
    const { code } = gen('@import { fmt } from "./local"\n<p>@fmt(1) @Status.Open</p>', {
      className: "Demo",
      inheritedImports: [
        {
          specifier: "../util",
          bindings: [
            { local: "fmt", imported: "fmt", typeOnly: false },
            { local: "Status", imported: "Status", typeOnly: false },
          ],
        },
        { specifier: "../theme.css", bindings: [] },
        { specifier: "../../util", bindings: [{ local: "Status", imported: "Status", typeOnly: false }] },
      ],
    });
    expect(code).toContain('import { fmt } from "./local";');
    expect(code).toContain('import { Status } from "../util";');
    expect(code).toContain('import "../theme.css";');
    expect(code).not.toContain('"../../util"');
    expect(code).not.toContain("this.Status");
  });

  it("does not import runtime APIs twice when an @import already binds them", () => {
    const { code } = gen(
      '@import { ComponentBase, EventCallback, Parameter } from "@tsazor/runtime"\n<Child OnClick="@go" />\n@code { @Parameter() Value = 1; go() {} }',
      { className: "Demo", resolveComponent: () => ({ specifier: "./Child.tsazor" }) },
    );
    expect(code).toContain('import { ComponentBase, EventCallback, Parameter } from "@tsazor/runtime";');
    // The generated code's own uses go through hygienic aliases.
    expect(code).toContain(
      'import { RenderTreeBuilder, ComponentBase as __tsazor_ComponentBase, EventCallback as __tsazor_EventCallback, RenderTreeBuilder as __tsazor_RenderTreeBuilder } from "@tsazor/runtime";',
    );
    expect(code).toContain("__tsazor_EventCallback.bind(this");
  });

  it("uses an imported component class for its tag and skips resolution", () => {
    const resolved: string[] = [];
    const { code } = gen('@import Fancy from "./widgets/Fancy.tsazor"\n<Fancy />', {
      className: "Demo",
      resolveComponent: (tag) => {
        resolved.push(tag);
        return null;
      },
    });
    expect(resolved).toEqual([]);
    expect(code).toContain("__builder.openComponent(0, Fancy);");
  });

  it("reports ambiguous tags (TZS017) and unresolved @using values (TZS018)", () => {
    const { diagnostics } = gen("@using ./Nowhere\n<Card />", {
      className: "Demo",
      resolveComponent: () => ({ specifier: "../Shared/Card.tsazor", ambiguous: ["../Shared", "@tsazor/fluent"] }),
      resolveUsing: (value) => (value === "./Nowhere" ? "missing" : null),
    });
    expect(diagnostics.all.map((d) => `${d.severity}:${d.code}`)).toEqual(["warning:TZS018", "error:TZS017"]);
  });

  it("does not import an @inject type the file already imports", () => {
    const { code } = gen('@import { CounterService } from "./services"\n@inject CounterService Counter\n<p>@Counter.count</p>', {
      className: "Demo",
      resolveType: () => ({ specifier: "./CounterService" }),
    });
    expect(code).not.toContain('"./CounterService"');
    expect(code).toContain("inject(CounterService)");
  });

  it("keeps an @inject field named like an imported type a member (Blazor idiom)", () => {
    const { code } = gen(
      '@import { NavigationManager } from "@tsazor/runtime"\n@inject NavigationManager NavigationManager\n<p>@NavigationManager.uri</p>',
    );
    expect(code).toContain("private readonly NavigationManager = __tsazor_inject(NavigationManager);");
    expect(code).toContain("this.NavigationManager.uri");
  });
});

describe("empty attribute values (A7)", () => {
  it("an empty quoted value is the empty string on elements and components (Blazor's href=\"\")", () => {
    const { code } = gen('<a class="">x</a><Link Href="" />', { resolveComponent: () => ({ specifier: "./Link.tsazor" }) });
    expect(code).toContain('__builder.addAttribute(1, "class", "");');
    expect(code).toContain('__builder.addAttribute(4, "Href", "");');
  });
});
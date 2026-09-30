import { describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { DiagnosticBag } from "../src/diagnostics";
import { generateCode } from "../src/codegen";
import { parseDocument } from "../src/parser";

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
    expect(code).toContain("b.addContent(");
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
    expect(code).toContain('b.addAttribute(1, "type", this.type);');
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
    expect(code).toContain('b.addAttribute(1, "OnDismissed", EventCallback.bind(this, this.alertGone));');
    expect(code).toContain('b.addAttribute(2, "OnClick", EventCallback.bind(this, this.poke));');
    expect(code).toContain('b.addAttribute(3, "OnSelect", EventCallback.bind(this, () => this.picked()));');
    // Non-event attribute values stay plain (e.g. string/number fields).
    expect(code).toContain('b.addAttribute(4, "Variant", this.variant);');
  });

  it("leaves element attribute expressions unwrapped (only component tags get the EventCallback conversion)", () => {
    const { code } = gen('<a href="@target" data-on="x">y</a>@code { private target = "/"; }');
    expect(code).toContain('b.addAttribute(1, "href", this.target);');
  });

  it("decodes HTML entities in text, static attributes and mixed attribute values (Razor parse-time decoding)", () => {
    const { code } = gen(
      '<h2>Tabs &amp; Accordion</h2><div title="A &amp; B" data-note="&#8212;">&notanentity;</div>' +
        '<span title="Zählen &amp; @expr">y</span>@code { private expr = 1; }',
    );
    expect(code).toContain('b.addContent(1, "Tabs & Accordion");');
    expect(code).toContain('b.addContent(1, "Tabs & Accordion");');
    expect(code).toContain('b.addAttribute(3, "title", "A & B");');
    expect(code).toContain('b.addAttribute(4, "data-note", "—");');
    // Unknown entities stay literal, matching HTML parsing.
    expect(code).toContain('b.addContent(5, "&notanentity;");');
    // Mixed attribute value: literal parts decode, expression parts untouched.
    expect(code).toContain("`Zählen & ${this.expr}`");
  });

  it("emits builder calls with monotone sequences", () => {
    const { code } = gen("<h1>@Title</h1><button class='btn'>Go</button>");
    expect(code).toContain('b.openElement(0, "h1");');
    expect(code).toContain("b.addContent(1, this.Title);");
    expect(code).toContain('b.openElement(2, "button");');
    expect(code).toContain('b.addAttribute(3, "class", "btn");');
    expect(code).toContain("b.closeElement();");
    expect(code).toContain("export default class Demo extends ComponentBase {");
  });

  it("imports only used runtime APIs", () => {
    const { code } = gen("<p>@x</p>");
    expect(code).toContain('import { ComponentBase, RenderTreeBuilder } from "@tsazor/runtime";');
    const { code: code2 } = gen('<button @onclick="Go">x</button>');
    expect(code2).toContain("EventCallback");
    expect(code2).toContain('b.addEventHandler(1, "onclick", EventCallback.bind(this, this.Go));');
  });

  it("resolves component tags to imports and emits ChildContent", () => {
    const { code } = gen("<Greeter Name='World'><p>child</p></Greeter>", {
      resolveComponent: (tag) => (tag === "Greeter" ? { specifier: "./Greeter.tsazor" } : null),
    });
    expect(code).toContain('import __tsazor_comp_Greeter from "./Greeter.tsazor";');
    expect(code).toContain("b.openComponent(0, __tsazor_comp_Greeter);");
    expect(code).toContain('b.addAttribute(1, "Name", "World");');
    expect(code).toContain('b.addContent(2, (b) => {');
    expect(code).toContain('b.closeComponent();');
  });

  it("unresolved components fall back to elements with a warning", () => {
    const { diagnostics, code } = gen("<UnknownTag />");
    expect(diagnostics.all.some((d) => d.code === "TZS005" && d.severity === "warning")).toBe(true);
    expect(code).toContain('b.openElement(0, "UnknownTag");');
    expect(code).not.toContain("openComponent");
  });

  it("emits routeTemplate and inject from directives", () => {
    const { code, metadata } = gen('@page "/users"\n@inject UserService Users\n', {
      resolveType: (name) => (name === "UserService" ? { specifier: "./services" } : null),
    });
    expect(code).toContain('export const routeTemplate = "/users";');
    expect(code).toContain("static routeTemplate = routeTemplate;");
    expect(code).toContain("private readonly Users = inject(UserService);");
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
    expect(code).toContain("b.setKey(this.item.Id);");
    expect(code).toContain("b.addElementReferenceCapture(1, (el) => { this.listItem = el; });");
  });

  it("emits if/else chains inside buildRenderTree", () => {
    const { code } = gen("@if (a) { <p>yes</p> } else { <p>no</p> }");
    expect(code).toContain("if (this.a) {");
    expect(code).toContain("else {");
  });

  it("emits foreach as for-of with fragment-safe sequences", () => {
    const { code } = gen("@foreach (var item in items) { <li>@item</li> }");
    expect(code).toContain("for (const item of this.items) {");
  });

  it("emits switch with auto break", () => {
    const { code } = gen('@switch (v) { case "a": <p>a</p> break; default: <p>d</p> break; }');
    expect(code).toContain('case "a": {');
    expect(code).toContain("default: {");
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
    // Baked expression starts at statement-text offset 16 (`    b.addContent(1, `);
    // entries are anchored in statement text coordinates + token landing offset.
    expect(onLine0.some((m) => m.genCol === 25 && m.srcCol === 4)).toBe(true);  // `Title` (position inside this.Title)
    expect(onLine0.some((m) => m.genCol === 31 && m.srcCol === 10)).toBe(true); // `name` (11 after "this.Title.")
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
    const openMaps = mappings.filter((m) => m.genLine === lineOf("b.openComponent("));
    expect(openMaps.some((m) => m.genCol === 4 && m.srcCol === 0)).toBe(true);
    expect(openMaps.some((m) => m.genCol > 4 && m.srcCol === 1)).toBe(true);

    // Attribute line: anchor at the attribute name + precise expression tokens
    // (`@this.order.deliveryAddress` → cols 10 / 15 / 21 relative to the name).
    const attrMaps = mappings.filter((m) => m.genLine === lineOf("b.addAttribute(1,"));
    expect(attrMaps.some((m) => m.genCol === 4 && m.srcCol === 15)).toBe(true);
    expect(attrMaps.some((m) => m.srcCol === 25)).toBe(true); // `this`
    expect(attrMaps.some((m) => m.srcCol === 30)).toBe(true); // `order`
    expect(attrMaps.some((m) => m.srcCol === 36)).toBe(true); // `deliveryAddress`

    // closeComponent: unmapped plumbing — lookups from source can never land on it.
    expect(mappings.filter((m) => m.genLine === lineOf("b.closeComponent();")).length).toBe(0);
  });

  it("anchors element tags and leaves closeElement unmapped", () => {
    const { code, mappings } = gen("<div class=\"x\">y</div>");
    const openMaps = mappings.filter((m) => m.genLine === code.split("\n").findIndex((l) => l.includes('b.openElement(')) + 1);
    expect(openMaps.some((m) => m.genCol === 4 && m.srcCol === 0)).toBe(true);
    expect(openMaps.some((m) => m.genCol > 4 && m.srcCol === 1)).toBe(true); // tag name inside the literal
    expect(mappings.filter((m) => m.genLine === code.split("\n").findIndex((l) => l.includes("b.closeElement();")) + 1).length).toBe(0);
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
    expect(code).toContain("export default class Demo extends ComponentBase {");
  });

  it("emits @bind as value attribute + change handler", () => {
    const { code } = gen('<input @bind="name" />');
    expect(code).toContain('b.addAttribute(1, "value", this.name);');
    expect(code).toContain(
      'b.addEventHandler(2, "onchange", EventCallback.bind(this, (e) => { this.name = (e.target as HTMLInputElement).value; }));',
    );
  });

  it("honors @bind:event and input-type extraction", () => {
    const { code } = gen('<input @bind="count" @bind:event="oninput" type="number" />');
    expect(code).toContain('b.addEventHandler(2, "oninput", EventCallback.bind(this, (e) => {');
    expect(code).toContain("Number((e.target as HTMLInputElement).value)");

    const { code: checkbox } = gen('<input @bind="enabled" type="checkbox" />');
    expect(checkbox).toContain('b.addAttribute(1, "checked", this.enabled);');
    expect(checkbox).toContain("(e.target as HTMLInputElement).checked");
  });

  it("emits @bind:get/:set/:after and warns on @bind:format", () => {
    const { code, diagnostics } = gen('<input @bind:get="display" @bind:set="store" @bind:after="done" @bind:format="yyyy" />');
    expect(code).toContain('b.addAttribute(1, "value", this.display);');
    expect(code).toContain("(this.store)((e.target as HTMLInputElement).value)");
    expect(code).toContain("this.done();");
    expect(diagnostics.all.some((d) => d.code === "TZS008" && d.severity === "warning")).toBe(true);
  });

  it("emits @bind-Value on components as Value + ValueExpression + ValueChanged", () => {
    const { code } = gen('<Stepper @bind-Value="current" />', {
      resolveComponent: (tag) => (tag === "Stepper" ? { specifier: "./Stepper.tsazor" } : null),
    });
    expect(code).toContain('b.addAttribute(1, "Value", this.current);');
    expect(code).toContain('b.addAttribute(2, "ValueExpression", "current");');
    expect(code).toContain('b.addAttribute(3, "ValueChanged", EventCallback.bind(this, (v) => { this.current = v; }));');
  });

  it("treats plain @bind on a component tag as Value + ValueChanged", () => {
    const { code } = gen('<InputText @bind="name" />', {
      resolveComponent: (tag) => (tag === "InputText" ? { specifier: "@tsazor/runtime", exportName: "InputText" } : null),
    });
    expect(code).toContain('b.addAttribute(1, "Value", this.name);');
    expect(code).toContain('b.addAttribute(2, "ValueExpression", "name");');
    expect(code).toContain('b.addAttribute(3, "ValueChanged", EventCallback.bind(this, (v) => { this.name = v; }));');
  });

  it("derives ValueExpression from member paths (@bind=\"this.model.name\" → \"name\")", () => {
    const { code } = gen('<TextInput @bind="this.model.name" />', {
      resolveComponent: (tag) => (tag === "TextInput" ? { specifier: "@tsazor/fluent", exportName: "TextInput" } : null),
    });
    expect(code).toContain('b.addAttribute(1, "Value", this.model.name);');
    expect(code).toContain('b.addAttribute(2, "ValueExpression", "name");');
  });

  it("does not emit ValueExpression for custom targets or get/set binds", () => {
    const { code } = gen('<Selected @bind-Selected="pick" />', {
      resolveComponent: (tag) => (tag === "Selected" ? { specifier: "./Selected.tsazor" } : null),
    });
    expect(code).not.toContain('"ValueExpression"');
    const custom = gen('<InputText @bind:get="this.pick" @bind:set="(v) => this.pick = v" />', {
      resolveComponent: (tag) => (tag === "InputText" ? { specifier: "@tsazor/runtime", exportName: "InputText" } : null),
    });
    expect(custom.code).not.toContain('"ValueExpression"');
  });

  it("keeps plain @bind on elements as value + change handler", () => {
    const { code } = gen('<input @bind="name" />');
    expect(code).toContain('b.addAttribute(1, "value", this.name);');
    expect(code).toContain("addEventHandler");
    expect(code).not.toContain('"ValueChanged"');
  });

  it("emits the scope attribute first on plain elements when scopeHash is set", () => {
    const { code: scoped, metadata } = gen('<input @bind="name" />', { scopeHash: "b-1a2b3c4d" });
    // The scope attribute is the first frame after openElement...
    expect(scoped).toContain('b.addAttribute(1, "b-1a2b3c4d", "");');
    // ...and subsequent frames shift by one sequence number.
    expect(scoped).toContain('b.addAttribute(2, "value", this.name);');
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
    expect(code.match(/b\.addAttribute\(\d+, "b-7f3e00aa", ""\)/g)?.length).toBe(3); // outer div, child span, button
    expect(code).toMatch(/b\.openComponent\(\d+, __tsazor_comp_Alert\);/); // component tag itself gets no scope frame
  });

  it("leaves emission byte-identical when scopeHash is unset (regression guard)", () => {
    // Without the option, no scope frames and unchanged sequence numbers —
    // this is what keeps the existing hard-coded-sequence tests stable.
    const { code } = gen('<input @bind="name" />');
    expect(code).toContain('b.addAttribute(1, "value", this.name);');
    expect(code).not.toContain('b.addAttribute(1, "b-');
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
    expect(code).toContain("b.addContent(1, g);");
    expect(code).not.toMatch(/^\s*\{\s*$/m);
  });

  it("scopes locals of control bodies to the body", () => {
    const { code } = gen("@if (a) {\n  const inner = 2;\n  <i>@inner</i>\n}\n<b>@inner</b>");
    expect(code).toContain("b.addContent(1, inner);");
    expect(code).toContain("b.addContent(3, this.inner);");
  });

  it("registers catch parameters and C#-style foreach variables as locals", () => {
    const { code } = gen(
      "@try { <p/> } catch (err) { <p>@err</p> }\n@foreach (string s in xs) { <i>@s</i> }\n@foreach (var (k, v) in pairs) { <i>@k@v</i> }",
    );
    expect(code).toContain("} catch (err) {");
    expect(code).toContain("b.addContent(2, err);");
    expect(code).toContain("for (const s of this.xs) {");
    expect(code).toContain("for (const [k, v] of this.pairs) {");
    expect(code).toContain("b.addContent(6, k);");
  });

  it("emits while and do-while loops", () => {
    const { code } = gen("@while (n < 3) { <i>@n</i> n++; }\n@do { <b/> } while (more);");
    expect(code).toContain("while (this.n < 3) {");
    expect(code).toContain("this.n++;");
    expect(code).toContain("do {");
    expect(code).toContain("} while (this.more);");
  });

  it("lets stacked switch labels fall through and adds break only when a section lacks a jump", () => {
    const { code } = gen("@switch (k) {\n  case 1:\n  case 2:\n    <p>low</p>\n    break;\n  default:\n    <p>x</p>\n}");
    expect(code).toContain("    case 1:\n    case 2: {\n");
    expect(code.match(/break;/g)?.length).toBe(2);
  });

  it("emits no whitespace text frames for single-line bodies (Razor: code-context whitespace)", () => {
    const { code } = gen("<ul>@foreach (var x in xs) { <li>@x</li> }</ul>");
    expect(code).not.toContain('b.addContent(1, " ")');
    // Sequence numbers stay compile-time and source-ordered.
    expect(code).toContain('b.openElement(1, "li");');
    expect(code).toContain("b.addContent(2, x);");
  });

  it("passes minimized attributes as true (Razor)", () => {
    const { code } = gen("<input type=checkbox disabled>");
    expect(code).toContain('b.addAttribute(1, "type", "checkbox");');
    expect(code).toContain('b.addAttribute(2, "disabled", true);');
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

  it("strips a C# @typeparam constraint with a warning and keeps the TS form", () => {
    const csharp = gen("@typeparam TItem where TItem : class\n");
    expect(csharp.code).toContain("export default class Demo<TItem> extends ComponentBase {");
    expect(csharp.diagnostics.all.some((d) => d.code === "TZS014")).toBe(true);
    const tsForm = gen("@typeparam T extends string\n");
    expect(tsForm.code).toContain("export default class Demo<T extends string> extends ComponentBase {");
    expect(tsForm.diagnostics.all).toHaveLength(0);
  });
});
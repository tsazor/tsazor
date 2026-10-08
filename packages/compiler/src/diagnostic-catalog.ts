/**
 * The catalog of every diagnostic code (TZS001…): when it is reported and
 * how to fix it — next to its message (DIAGNOSTIC_MESSAGES, the title).
 * The single source for the reference's diagnostics page;
 * test/diagnostic-catalog.test.ts keeps it in step with the codes the
 * compiler reports and compiles each example to check it reports its code.
 */

export interface DiagnosticInfo {
  /** `TZS001`. */
  readonly code: string;
  /** "error or warning": the severity depends on the case (see the description). */
  readonly severity: "error" | "warning" | "error or warning";
  /** When it is reported (Markdown). */
  readonly description: string;
  /**
   * A component source (`.tsazor`) that reports this code when compiled on its
   * own (no other components known); omitted when the code needs a workspace
   * (component metadata, `@using` folders, ambiguous tags).
   */
  readonly example?: string;
  /** How to fix it (Markdown). */
  readonly fix: string;
  /** The diagnostic carries a mechanical fix (LSP quick fix, codemod). */
  readonly quickFix?: boolean;
}

/** Codes that are no longer reported; their numbers are not reused. */
export const RETIRED_DIAGNOSTIC_CODES: readonly string[] = ["TZS007", "TZS010"];

export const DIAGNOSTIC_CATALOG: readonly DiagnosticInfo[] = [
  {
    code: "TZS001",
    severity: "error",
    description:
      "Reported for an `@inject` without both a type and a name, for a continuation keyword without its statement (`@else`, `@case`, `@catch` in markup; `else`/`catch`/`finally` without a matching `if`/`try`, `case`/`default` outside a `@switch`), for statements in a `@switch` before the first label, and for an unknown directive attribute such as `@foo=\"…\"`.",
    example: "@inject CounterService\n\n<p>@Counter.value</p>\n",
    fix:
      "Complete or move the construct: `@inject CounterService Counter` (type, then name), put `else`/`case` directly after its `if`/`switch`, and use a known directive attribute (`@onclick`, `@bind`, `@key`, `@ref`, `@attributes`, `@attach`, `@transition`, `@in`, `@out`, `@animate`).",
  },
  {
    code: "TZS002",
    severity: "error",
    description:
      "An element's markup is broken: a start tag without its closing tag, a start tag without `>`, a closing tag without `>`, a closing tag that nothing opened, or `<` without a tag name. Reported on the start tag (or the stray closing tag).",
    example: "<div>\n  <span>Hello\n</div>\n",
    fix:
      "Close every element (`<span>Hello</span>`) or write it self-closing (`<Counter />`); void elements such as `<input>` and `<br>` need no closing tag.",
  },
  {
    code: "TZS003",
    severity: "error",
    description:
      "Brackets do not pair up: a `}` in markup that closes nothing, an `@(…)` expression (in markup or an attribute value) or a control condition `(…)` that never closes, a missing `(` after `@if`/`@while`/…, or an unexpected character in code. Also a `do` block without its `while (…)`, a `try` without `catch` or `finally`, and a `case` label without `:`.",
    example: "<p>Hello</p>\n}\n",
    fix:
      "Balance the braces and parentheses — usually a `}` too many after an `@if`/`@foreach` block, or a missing `)` in `@(…)`.",
  },
  {
    code: "TZS004",
    severity: "error",
    description:
      "An `@` in markup is followed by neither an identifier nor `(`, `{`, `:`, `*` or `@`, so it starts no expression (`@ name`, `@-1`).",
    example: "<p>Price: @ price</p>\n\n@code {\n  price = 10;\n}\n",
    fix:
      "Write the expression right after the `@` (`@price`, `@(price * 2)`), or escape a literal at sign as `@@`.",
  },
  {
    code: "TZS005",
    severity: "warning",
    description:
      "A component tag (PascalCase or dotted) resolves to no component: no `@import` names it, and no component folder or package from `@using` provides it. The tag is emitted as a plain element.",
    example: "<Counter />\n",
    fix:
      "Import the component (`@import { Counter } from \"./Counter.tsazor\"`) or add the folder or package that provides it with `@using`; for a misspelled tag, correct the name.",
  },
  {
    code: "TZS006",
    severity: "error",
    description:
      "A block is never closed or never opened: `@code` without `{`, a code block (`@code`, `@{`, a control body) that never closes, a `@*` comment without `*@`, `@switch`/`try` without a `{` block, or a control header followed by no statement.",
    example: "@code {\n  count = 0;\n",
    fix: "Add the missing `}` (or `*@` for a Razor comment), or the `{ … }` block after `@switch (…)` or `try`.",
  },
  {
    code: "TZS008",
    severity: "error or warning",
    description:
      "A directive attribute is used wrongly. Errors: an event handler without a value (`@onclick`), an unknown or duplicate event or bind modifier, `@bind-` without a parameter name, an invalid `:get`/`:set`/`:after` combination (Blazor .NET 7 rules), a bind target that cannot be assigned (`a?.b`, `f()`, a `const` or loop variable), a non-identifier `:event` on a component bind, `@ref` without a bare property name, and an `@attach` on a component tag, twice with the same name on one element, or as `@attach:` without a name; a motion directive (`@transition`, `@in`, `@out`, `@animate`) on a component tag or twice on one element, `@transition` together with `@in`/`@out`, a `:global` without its transition or with a value, an unknown modifier, and `@animate` on anything but a keyed loop row. Warnings: `:format` or `:culture` that has no effect — on a component bind, `:format` on anything but a date or number input, `:culture` on anything but a number input.",
    example: "<button @onclick>Save</button>\n",
    fix:
      "Give the attribute the form Blazor accepts: `@onclick=\"save\"`, `@bind:get=\"value\" @bind:set=\"setValue\"`, `@ref=\"input\"` (a member name), `@attach:tooltip=\"…\"` for a second attachment (a component takes an `Attachment` parameter instead), `@in=\"fade\" @in:global` (the modifier valueless, next to its transition), `@animate` on the element directly inside `@foreach` that has `@key`, a known modifier (`:preventDefault`, `:stopPropagation`, `:event`, `:format`, `:culture`, `:get`, `:set`, `:after`); remove a `:format`/`:culture` that has no effect.",
  },
  {
    code: "TZS009",
    severity: "error",
    description:
      "An attribute has no usable value: a directive attribute without one (`@bind`, `@key`, `@ref`, `@attributes`, `@attach`, `@transition`, `@in`, `@out`, `@animate`) or with mixed text and code, an `=` without a value, a quoted value that never closes, or an invalid attribute name. Also a component parameter of a non-string type set to empty text, an `EventCallback` parameter without a handler, and an empty type argument (`TItem=\"\"`).",
    example: "<input @bind />\n",
    fix: "Give the attribute one expression: `@bind=\"name\"`, `@key=\"item.id\"`, `TItem=\"Person\"`; close the quoted value.",
  },
  {
    code: "TZS011",
    severity: "warning",
    description:
      "The component has a code-behind file (`X.tsazor.ts`) and also declares `@inherits`. The code-behind class is the base of the generated component, so the `@inherits` directive has no effect.",
    fix:
      "Remove `@inherits` from the `.tsazor` file and let the code-behind class extend the intended base class (`export default class extends LayoutComponentBase`).",
  },
  {
    code: "TZS012",
    severity: "error",
    description:
      "A C# construct without a TypeScript counterpart: the `using (…) { }` statement, the `lock (…) { }` statement, and `@await` in markup (the render method is synchronous). Razor accepts these; Tsazor's code is TypeScript.",
    example: "<p>@await LoadAsync()</p>\n",
    fix:
      "Await in a lifecycle method and render the stored result (`async onInitializedAsync() { this.data = await this.load(); }`, then `@data`); replace `using (…)` with `try`/`finally` or a `using` declaration; drop `lock`.",
  },
  {
    code: "TZS013",
    severity: "error",
    description:
      "A directive (`@page`, `@inject`, `@using`, …) or an `@code`/`@functions` block is written inside an element or a code block. They are only valid at document level.",
    example: "<div>\n  @page \"/counter\"\n</div>\n",
    fix: "Move the directive or the `@code` block to the top level of the file, outside any element or block.",
  },
  {
    code: "TZS014",
    severity: "warning",
    description:
      "A Blazor-only directive with no effect in Tsazor: `@rendermode` or `@preservewhitespace`. Also reported for `@authorize` in `_Imports.tsazor`, which is not inherited by the pages below it.",
    example: "@rendermode InteractiveServer\n\n<p>Hello</p>\n",
    fix: "Remove the directive; for `@authorize`, declare it on each page that requires it.",
  },
  {
    code: "TZS015",
    severity: "error",
    description:
      "A code context (`@{ … }`, a control body, a `@for` header) is not valid TypeScript: typically a C# declaration (`int count = 0;`, `string s = …`) or bare text in a code block. Also a `@foreach` header that is not `for…of`/`for…in` (a counting header belongs to `@for`). Reported on the first syntax error.",
    example: "@{\n  int count = 0;\n}\n<p>@count</p>\n",
    fix:
      "Write TypeScript (`let count = 0;`, `const s: string = …`); start markup in code with a tag, `@:` or `<text>`; use `@for (let i = 0; i < n; i++)` for a counting loop. A C# string in a `@for` header gets the template literal quick fix.",
    quickFix: true,
  },
  {
    code: "TZS016",
    severity: "error",
    description:
      "The value of an `@import` directive is not a TypeScript import: it is empty, does not parse as one import declaration, or its module specifier is not a string literal.",
    example: "@import { formatDate } from ./dates\n\n<p>Today</p>\n",
    fix: "Write it like a TS `import` without the keyword: `@import { formatDate } from \"./dates\"`, `@import X from \"./x\"`, `@import \"./x.css\"`.",
  },
  {
    code: "TZS017",
    severity: "error",
    description:
      "A component tag resolves in more than one place — two `@using` folders or packages both provide a component of that name.",
    fix: "Remove one of the `@using` directives, or `@import` the intended component explicitly; an explicit import wins.",
  },
  {
    code: "TZS018",
    severity: "warning",
    description:
      "A `@using` names a folder that does not exist or a package that is not installed, so no components or types resolve through it. For `_Imports.tsazor`, it is reported in that file.",
    fix: "Correct the path (relative to the file) or the package name, or install the package.",
  },
  {
    code: "TZS019",
    severity: "error",
    description:
      "An `@attribute` value that is neither a TS class decorator (`@attribute @x()`) nor a readable C# attribute list (`@attribute Authorize`), an invalid `@authorize` argument (not an object literal with literal `roles`/`policy`), or several `@authorize` with roles or with a policy, which cannot be combined.",
    example: "@authorize({ role: \"Admin\" })\n\n<h1>Admin</h1>\n",
    fix: "Use `@authorize`, `@authorize({ roles: [\"Admin\"], policy: \"P\" })` (one role list and one policy per page), or `@attribute @decorator(…)`.",
  },
  {
    code: "TZS020",
    severity: "error",
    description:
      "`buildRenderTree` is declared in `@code` or in the code-behind class. Every `.tsazor` file generates this member (also without markup), so the hand-written one would be a duplicate (Blazor: CS0111) or replaced.",
    example: "@code {\n  buildRenderTree(builder: RenderTreeBuilder) {}\n}\n",
    fix: "Write the output as markup, or make the component a plain `.ts` class that extends `ComponentBase` and implements `buildRenderTree` itself.",
  },
  {
    code: "TZS021",
    severity: "error",
    description:
      "A C# form with a mechanical TypeScript counterpart; the message names it. Reported for C# `@foreach` headers (`var x in xs`, `string s in xs`, `var (k, v) in pairs`), a `where T : …` constraint on `@typeparam`, and C# attribute lists in `@attribute` (`[Authorize]`, `[Route(\"…\")]`, `[AllowAnonymous]`, …). Razor accepts these; Tsazor needs the TS form.",
    example: "@foreach (var item in items)\n{\n  <li>@item</li>\n}\n\n@code {\n  items = [\"a\", \"b\"];\n}\n",
    fix:
      "Use the form the message names: `@foreach (const item of items)`, `@typeparam T extends IItem`, `@authorize({ roles: [\"A\"] })`, `@page \"/x\"`. The quick fix and the codemod apply it where it is mechanical.",
    quickFix: true,
  },
  {
    code: "TZS022",
    severity: "warning",
    description:
      "A `var` declaration in render code (`@{ … }`, control bodies and headers). In TypeScript `var` is function-scoped: one binding for the whole render method, shared by every loop iteration and deferred child content. Razor's C# `var` is block-scoped.",
    example: "@{\n  var total = 0;\n}\n<p>@total</p>\n",
    fix: "Use `let` (or `const`): `let total = 0;`.",
    quickFix: true,
  },
  {
    code: "TZS023",
    severity: "warning",
    description:
      "A non-empty `case` or `default` section of a `@switch` (other than the last) does not end with `break`, `return`, `throw` or `continue`, so it falls through to the next one. TypeScript has no implicit `break`; C# forbids fall-through instead. Stacked empty labels are fine.",
    example: "@switch (state)\n{\n  case 1:\n    <p>One</p>\n  case 2:\n    <p>Two</p>\n    break;\n}\n\n@code {\n  state = 1;\n}\n",
    fix: "End the section with `break;` (or `return`), unless falling through is intended.",
  },
  {
    code: "TZS024",
    severity: "error",
    description:
      "A markup expression is not valid TypeScript: `@x`, `@(…)`, attribute values, event handlers, `@key`, `@attributes`, `@bind` values and modifiers, control conditions, `case` labels, or a type argument (`TItem=\"…\"`). Typical C# leftovers are interpolated or verbatim strings (`$\"…{x}\"`, `@\"…\"`), casts (`(MarkupString)x`), anonymous objects (`new { … }`), `out var` and `is not null`. Reported on the first syntax error's token.",
    example: "<p>@($\"Hello {name}\")</p>\n\n@code {\n  name = \"World\";\n}\n",
    fix:
      "Write the TypeScript form: a template literal for a C# string (`` `Hello ${name}` `` — the quick fix when the string is the cause), `x as MarkupString`, an object literal `{ … }`, `x !== null`.",
    quickFix: true,
  },
  {
    code: "TZS025",
    severity: "error",
    description:
      "A component attribute or child content element names no parameter of the component, whose parameters are fully known (and which does not capture unmatched values). Also element content on a component without a `ChildContent` parameter, and an event modifier on a component that has nothing to capture it.",
    fix:
      "Correct the name (the quick fix offers a close match: `Lable` ⇒ `Label`, `<RowTemplat>` ⇒ `<RowTemplate>`), use one of the parameters the message lists, or add the parameter to the component.",
    quickFix: true,
  },
  {
    code: "TZS026",
    severity: "warning",
    description:
      "The compiler cannot tell how to pass an attribute value: the component's parameters are unknown (no source file or package manifest describes it, or it does not extend `ComponentBase`) or incomplete (an unresolved base class), or one parameter's type cannot be followed. The value is passed as written — plain text as a string, `On*` values as EventCallbacks.",
    fix: "Annotate the parameter with a type the compiler can follow, make the component's source or manifest (and its base class) resolvable, or write the value as an explicit expression (`Count=\"@5\"`).",
  },
  {
    code: "TZS027",
    severity: "error",
    description:
      "Child content is in the wrong place: loose content next to explicit child content elements of a component (Razor: RZ9996), or a child content element (`<RowTemplate>`) that is not a direct child of its component — nested in markup, a code block, or outside the component.",
    fix: "Wrap loose content in `<ChildContent>…</ChildContent>`, and place each child content element directly inside its component tag.",
  },
  {
    code: "TZS028",
    severity: "error",
    description:
      "A child content element is invalid: used twice, also set by an attribute (RZ9995), carrying an attribute other than `Context` (and `Context` only on a `RenderFragment<T>`), a `Context` value that is not a literal identifier, or a non-fragment parameter written as an element.",
    fix: "Set each child content parameter once, either as an element or as an attribute; keep only `Context=\"item\"` on the element; set a non-fragment parameter as an attribute (`Title=\"…\"`).",
  },
  {
    code: "TZS029",
    severity: "error",
    description:
      "Nested templates use the same context name, so the inner one would hide the outer one (Razor: RZ9999) — typically two nested `RenderFragment<T>` contents both called `context`.",
    fix: "Name the inner context explicitly: `<RowTemplate Context=\"row\">`, then use `@row` inside it.",
  },
  {
    code: "TZS030",
    severity: "error",
    description:
      "`@Bindable()` or `@State()` decorates a plain field (or another member) instead of an auto-accessor. A standard field decorator cannot intercept assignments, so the change callback would never fire (`@Bindable`) or the component never render (`@State`). Also `@State()` together with `@Parameter()`/`@Bindable()`: a parameter belongs to the parent, which overwrites it.",
    example: "@code {\n  @Bindable() value = 0;\n}\n",
    fix: "Insert `accessor`: `@Bindable() accessor value = 0;`, `@State() accessor seconds = 0;`. Keep either `@State()` or the parameter decorator.",
    quickFix: true,
  },
  {
    code: "TZS031",
    severity: "error",
    description:
      "A `@code` member or an `@inject` name equals a `ComponentBase` member (`observe`, `inject`, `stateHasChanged`, `disposeSignal`, `isInitialized`, …) and would replace it. Blazor's base members are PascalCase and never meet a component's fields; Tsazor's camelCase API shares their namespace. Overriding the lifecycle hooks (`onInitialized`, `onParametersSet`, …) stays allowed.",
    example: "@code {\n  isInitialized = false;\n}\n",
    fix: "Rename the member or the injected service: `loaded = false` instead of `isInitialized = false`, `@inject Injector injector` instead of `@inject Injector inject`.",
  },
  {
    code: "TZS032",
    severity: "error",
    description:
      "A `@code` member is named like one of Blazor's lifecycle methods (`onInitializedAsync`, `OnParametersSet`, `OnAfterRenderAsync`, `Dispose`, …). Tsazor never calls it, so its code never runs. Tsazor has one hook for each step, and the hook may be async: `onInitialized`, `onParametersSet`, `onAfterRender`.",
    example: "<p>@text</p>\n\n@code {\n  text = \"\";\n  protected async onInitializedAsync() {\n    this.text = \"loaded\";\n  }\n}\n",
    fix: "Rename it to Tsazor's hook (quick fix): `protected override async onInitialized(): Promise<void>`.",
  },
];

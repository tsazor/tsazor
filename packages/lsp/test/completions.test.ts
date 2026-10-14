/**
 * Completion tests over a temp workspace (same pattern as analysis.test.ts —
 * in-process, no VS Code).
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analysis";
import { classifySlice, completeAt } from "../src/completions";

let root = "";
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-compl-"));
  root = dir;
  await mkdir(path.join(dir, "Pages"), { recursive: true });
  await mkdir(path.join(dir, "Shared"), { recursive: true });
  await writeFile(
    path.join(dir, "Shared", "Greeter.tsazor"),
    '<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n    @Parameter() NameChanged?: EventCallback<string>;\n    @Parameter() Title?: string;\n    @CascadingParameter() theme?: string;\n    greetCount = 0;\n}\n',
  );
  // Parameters inherited from a code-behind base and from the runtime (InputBase).
  await writeFile(path.join(dir, "Shared", "Fancy.tsazor"), "<p></p>\n@code {\n    @Parameter() own = 1;\n}\n");
  await writeFile(
    path.join(dir, "Shared", "Fancy.tsazor.ts"),
    'import { ComponentBase, Parameter } from "@tsazor/runtime";\nexport default class Fancy extends ComponentBase {\n    @Parameter() behind?: string;\n}\n',
  );
  await writeFile(path.join(dir, "Shared", "TextBox.tsazor"), "@inherits InputBase<string>\n<input />\n");
  // Templated component (2.3 metadata): Header/Footer are plain fragments, Row
  // is generic — its body receives the context variable.
  await writeFile(
    path.join(dir, "Shared", "Cards.tsazor"),
    [
      "<table></table>",
      "",
      "@code {",
      "    @Parameter() Title?: string;",
      "    @Parameter() Header?: RenderFragment;",
      "    @Parameter() Row?: RenderFragment<RowData>;",
      "}",
      "",
    ].join("\n"),
  );
  // A component whose loose content IS a generic ChildContent (context var).
  await writeFile(path.join(dir, "Shared", "Looper.tsazor"), "<div></div>\n\n@code {\n    @Parameter() ChildContent?: RenderFragment<string>;\n}\n");
  // _Imports makes root + Shared resolvable for every file below root.
  await writeFile(path.join(dir, "_Imports.tsazor"), "@using ./Shared\n");
  cleanup = async () => rm(dir, { recursive: true, force: true });
});

afterAll(() => cleanup());

const GREETER_PAGE = [
  "@page \"/greeter\"",
  "",
  "<Greeter",
  "    Name=\"@name\"",
  "    greetCount=\"@count\"",
  "    otherParam=\"x\"",
  "/>",
  "",
  "<p>Count: @count</p>",
  "",
  "@code {",
  "    name = \"World\";",
  "    count = 3;",
  "}",
].join("\n");

const complete = async (source: string, line: number, character: number) => {
  const analyzed = await analyzeSource(path.join(root, "Pages", "Demo.tsazor"), source, root);
  return completeAt(analyzed, line, character).map((c) => c.label);
};

describe("completeAt — directives", () => {
  it("offers directive keywords after a bare @ at line start", async () => {
    const source = "@\n";
    const labels = await complete(source, 0, 1);
    expect(labels).toContain("page");
    expect(labels).toContain("inject");
    expect(labels).toContain("authorize");
    expect(labels).toContain("allowAnonymous");
    expect(labels).toContain("code");
  });

  it("filters directives by the typed prefix", async () => {
    const labels = await complete("@pa\n", 0, 3);
    expect(labels).toEqual(["page"]);
  });

  it("offers directives and members together when the line is only @word", async () => {
    // "@c" at line start could be a directive OR an expression member — both
    // are offered (VS Code filters by the remaining prefix).
    const source = "@c\n\n@code { count = 3; }\n";
    const labels = await complete(source, 0, 2);
    expect(labels).toContain("code");
    expect(labels).toContain("count");
  });
});

describe("completeAt — component tags", () => {
  it("offers tags from @using directories after <", async () => {
    const labels = await complete("<\n", 0, 1);
    expect(labels).toContain("Greeter");
  });

  it("filters tag candidates by the typed prefix", async () => {
    const labels = await complete("<Gre\n", 0, 4);
    expect(labels).toEqual(["Greeter"]);
  });

  it("offers runtime built-ins as tags", async () => {
    const labels = await complete("<NavL\n", 0, 5);
    expect(labels).toEqual(["NavLink"]);
  });
});

describe("completeAt — attributes", () => {
  it("offers the resolved component's @Parameter() names", async () => {
    // Cursor inside "<Greeter\n    |" (attribute-name position, after the spaces)
    const labels = await complete(GREETER_PAGE, 3, 4);
    expect(labels).toContain("Name");
    // Plain fields are not parameters — only @Parameter() names are offered.
    expect(labels).not.toContain("greetCount");
  });

  it("offers @bind-<param> only for params with a <Param>Changed EventCallback", async () => {
    const labels = await complete(GREETER_PAGE, 3, 4);
    expect(labels).toContain("@bind-Name");
    expect(labels).not.toContain("@bind-Title");
    expect(labels).not.toContain("@bind-NameChanged");
  });

  it("does not offer cascading parameters as attributes", async () => {
    const labels = await complete(GREETER_PAGE, 3, 4);
    expect(labels).toContain("Title");
    expect(labels).not.toContain("theme");
  });

  it("offers inherited parameters (code-behind base, runtime InputBase)", async () => {
    expect(await complete("<Fancy \n", 0, 7)).toEqual(expect.arrayContaining(["own", "behind"]));
    const textBox = await complete("<TextBox \n", 0, 9);
    expect(textBox).toEqual(expect.arrayContaining(["value", "valueChanged", "@bind-value"]));
    expect(textBox).not.toContain("editContext");
  });

  it("describes parameters with category and type", async () => {
    const analyzed = await analyzeSource(path.join(root, "Pages", "Demo.tsazor"), GREETER_PAGE, root);
    const name = completeAt(analyzed, 3, 4).find((c) => c.label === "Name");
    expect(name?.detail).toBe("Greeter · string · string");
  });

  it("offers built-in parameters on runtime components", async () => {
    const source = "<NavLink \n";
    const labels = await complete(source, 0, 9);
    expect(labels).toContain("href");
    expect(labels).toContain("activeClass");
  });

  it("offers common attributes on plain elements", async () => {
    const source = "<div \n";
    const labels = await complete(source, 0, 5);
    expect(labels).toContain("class");
    expect(labels).toContain("@onclick");
    expect(labels).not.toContain("@bind-Name");
  });

  it("offers @attach and @attach: on elements only (F2)", async () => {
    expect(await complete("<input @att\n", 0, 11)).toEqual(["@attributes", "@attach", "@attach:"]);
    const labels = await complete(GREETER_PAGE, 3, 4);
    expect(labels).not.toContain("@attach");
    expect(labels).toContain("@ref");
  });

  it("returns nothing inside a quoted attribute value", async () => {
    const source = '<div class="\n';
    const labels = await complete(source, 0, 12);
    expect(labels).toEqual([]);
  });
});

describe("completeAt — expression members", () => {
  it("offers @code members and @inject fields after @", async () => {
    const source = "@page \"/greeter\"\n@inject UserService User\n\n<p>Count: @c</p>\n\n@code { count = 3; }\n";
    const afterAt = await complete(source, 3, 11); // right after "@"
    expect(afterAt).toContain("count");
    expect(afterAt).toContain("User");
    const afterC = await complete(source, 3, 12); // "@c" — filtered by the typed prefix
    expect(afterC).toContain("count");
    expect(afterC).not.toContain("User");
    expect(afterC).not.toContain("name");
  });

  it("offers own and inherited @import names after @", async () => {
    const pages = path.join(root, "Pages");
    await writeFile(path.join(pages, "_Imports.tsazor"), '@import { formatDate } from "../util"\n');
    try {
      const source = '@import { Status } from "../status"\n<p>@</p>\n';
      const labels = await complete(source, 1, 4);
      expect(labels).toContain("Status");
      expect(labels).toContain("formatDate");
    } finally {
      await rm(path.join(pages, "_Imports.tsazor"));
    }
  });

  it("filters members by prefix", async () => {
    const source = "<p>@na</p>\n\n@code { name = \"x\"; count = 0; }\n";
    const labels = await complete(source, 0, 5);
    expect(labels).toEqual(["name"]);
  });
});

describe("completeAt — slots (2.5)", () => {
  const CARDS_PAGE = "<Cards>\n    <Row\n</Cards>\n";

  it("offers the fragment parameters of the enclosing component as slot tags", async () => {
    const labels = await complete(CARDS_PAGE, 1, 6); // after "<Ro"
    expect(labels).toEqual(["Row", "Router", "RouteView"]); // slot first, runtime components matching the prefix
  });

  it("a component with the slot's name is shadowed by the slot in the parent's content", async () => {
    await writeFile(path.join(root, "Pages", "Header.tsazor"), "<hr />\n");
    try {
      const labels = await complete("<Cards>\n    <Head\n</Cards>\n", 1, 8); // after "<Head"
      // The slot binds first (TZS025's rename rule says the same); 3.4 added
      // the Head* runtime components, which match the prefix as usual.
      expect(labels).toEqual(["Header", "HeadContent", "HeadOutlet"]);
    } finally {
      await rm(path.join(root, "Pages", "Header.tsazor"));
    }
  });

  it("still offers components that are no slots", async () => {
    const labels = await complete("<Cards>\n    <Loo\n</Cards>\n", 1, 7); // after "<Loo"
    expect(labels).toEqual(["Looper"]);
  });

  it("offers no slots inside a slot's fragment body (TZS027 nesting)", async () => {
    const labels = await complete("<Cards>\n    <Row>\n        <He\n    </Row>\n</Cards>\n", 2, 12); // after "<He"
    expect(labels).not.toContain("Header");
    expect(labels).not.toContain("Row");
  });

  it("offers Context on a generic slot element", async () => {
    const labels = await complete("<Cards>\n    <Row />\n</Cards>\n", 1, 9); // attribute-name position (the space before "/>")
    expect(labels).toContain("Context");
  });

  it("offers no Context on non-generic parameters", async () => {
    const labels = await complete(GREETER_PAGE, 3, 4);
    expect(labels).not.toContain("Context");
  });

  it("offers the context variable in a slot body (default name)", async () => {
    const labels = await complete("<Cards>\n    <Row>\n        <p>@co</p>\n    </Row>\n</Cards>\n", 2, 14); // after "@co"
    expect(labels).toContain("context");
  });

  it("offers the renamed context variable (Context=\"user\")", async () => {
    const labels = await complete("<Cards>\n    <Row Context=\"user\">\n        <p>@us</p>\n    </Row>\n</Cards>\n", 2, 14); // after "@us"
    expect(labels).toContain("user");
    expect(labels).not.toContain("context");
  });

  it("offers the context variable in a component's loose content (generic ChildContent)", async () => {
    const labels = await complete("<Looper>\n    @co\n</Looper>\n", 1, 6); // after "@co"
    expect(labels).toContain("context");
  });

  it("offers a runtime component's camelCase fragment parameters as PascalCase slot tags (<Await>)", async () => {
    const slotsAfter = async (prefix: string) => {
      const analyzed = await analyzeSource(path.join(root, "Pages", "Demo.tsazor"), `<Await For="@(1)">\n    <${prefix}\n</Await>\n`, root);
      return completeAt(analyzed, 1, 5 + prefix.length).filter((c) => c.kind === "slot");
    };
    const then = await slotsAfter("Th");
    expect(then.map((c) => c.label)).toEqual(["Then"]);
    expect(then[0]!.snippet).toMatch(/^Then[^>]*>\n\t\$0\n<\/Then>$/);
    expect((await slotsAfter("pe")).map((c) => c.label)).toEqual(["Pending"]);
    expect((await slotsAfter("Ca")).map((c) => c.label)).toEqual(["Catch"]);
  });

  it("describes the context variable's type from the RenderFragment<T> argument", async () => {
    const analyzed = await analyzeSource(path.join(root, "Pages", "Demo.tsazor"), "<Cards>\n    <Row>\n        <p>@</p>\n    </Row>\n</Cards>\n", root);
    const context = completeAt(analyzed, 2, 12); // right after "@"
    expect(context.find((c) => c.label === "context")?.detail).toBe("slot context · RowData");
  });
});

describe("completeAt — boundaries", () => {
  it("defers @code positions to the v2 TypeScript layer (v1 returns nothing)", async () => {
    // The v1 heuristics own markup only; inside @code the server routes to the
    // TypeScript shadow layer (see test/ts-features.test.ts).
    const source = "@page \"/x\"\n\n@code {\n    c \n}\n";
    const labels = await complete(source, 3, 6); // inside the code block
    expect(labels).toEqual([]);
  });

  it("returns nothing in closing-tag positions", async () => {
    const labels = await complete("<div></\n", 0, 8);
    expect(labels).toEqual([]);
  });
});

describe("classifySlice (unit)", () => {
  it("classifies tag-name positions", () => {
    expect(classifySlice("<")).toEqual({ state: "tagName", prefix: "" });
    expect(classifySlice("<Greeter")).toEqual({ state: "tagName", prefix: "Greeter" });
  });
  it("classifies attribute-name positions", () => {
    expect(classifySlice("<Greeter ")).toEqual({ state: "attrName", prefix: "" });
    expect(classifySlice('<div class="x" ')).toEqual({ state: "attrName", prefix: "" });
    expect(classifySlice('<div class="x" cla')).toEqual({ state: "attrName", prefix: "cla" });
  });
  it("classifies value positions and quotes", () => {
    expect(classifySlice('<div class="x"')).toEqual({ state: "value", prefix: "" });
    expect(classifySlice('<div class="x" href=@na')).toEqual({ state: "value", prefix: "" });
  });
  it("classifies past the opening tag", () => {
    expect(classifySlice("<div>")).toEqual({ state: "past", prefix: "" });
  });
});
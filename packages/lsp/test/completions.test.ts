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
    '<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n    greetCount = 0;\n}\n',
  );
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

  it("offers @bind-<param> pairs on components", async () => {
    const labels = await complete(GREETER_PAGE, 3, 4);
    expect(labels).toContain("@bind-Name");
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
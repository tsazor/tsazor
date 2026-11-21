/**
 * The lesson texts make concrete claims about rendering ("null leaves the
 * attribute out", "`@quantity * price` renders as text", …). These tests pin
 * each claim to the real compiler + runtime, so a framework change that
 * breaks one fails here instead of silently making the tutorial wrong.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import { buildProject, type Files } from "../src/engine/compile-project";
import { scopeCss } from "../src/engine/scoped-css";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateDir = path.join(appRoot, ".gate", "claims");
let counter = 0;

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

async function renderApp(files: Files): Promise<string> {
  const build = buildProject(files);
  expect(build.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const dir = path.join(gateDir, String(counter++));
  mkdirSync(dir, { recursive: true });
  for (const module of Object.values(build.modules)) {
    writeFileSync(path.join(dir, `${module.file}.js`), module.code.replace(/(["'])\$app\/([^"']+)\1/g, "$1./$2.js$1"));
  }
  const module = (await import(pathToFileURL(path.join(dir, "App.tsazor.js")).href)) as { default: never };
  const result = await render(module.default);
  // Drop the renderer's boundary comments (component and markup ranges).
  const html = result.container.innerHTML.replace(/<!--\/?bl-tsazor:[^>]*-->/g, "");
  result.dispose();
  return html;
}

const strip = (html: string): string => html.replace(/\s+b-[0-9a-f]{8}=""/g, "");

describe("lesson claims", () => {
  it("`@name!` ends the implicit expression before the `!`", async () => {
    expect(await renderApp({ "App.tsazor": `<h1>Hello @name!</h1>\n@code {\n    name = "Tsazor";\n}` })).toBe("<h1>Hello Tsazor!</h1>");
  });

  it("an implicit expression ends at a space; @( ) evaluates operators", async () => {
    const html = await renderApp({
      "App.tsazor": `<p>@quantity * price</p><p>@(quantity * price)</p><p>@price.toFixed(2)</p><p>@(quantity > 1 ? "tickets" : "ticket")</p>\n@code {\n    quantity = 3;\n    price = 4.5;\n}`,
    });
    expect(html).toBe("<p>3 * price</p><p>13.5</p><p>4.50</p><p>tickets</p>");
  });

  it("booleans render as true/false, null and undefined as nothing", async () => {
    const html = await renderApp({ "App.tsazor": `<p>@yes|@empty|@missing</p>\n@code {\n    yes = true;\n    empty = null;\n    missing = undefined;\n}` });
    expect(html).toBe("<p>true||</p>");
  });

  it("text is escaped", async () => {
    const html = await renderApp({ "App.tsazor": `<p>@html</p>\n@code {\n    html = "<b>x</b>";\n}` });
    expect(html).toBe("<p>&lt;b&gt;x&lt;/b&gt;</p>");
  });

  it("attributes: mixed text, null omits, false removes a boolean attribute, bare means true", async () => {
    const html = await renderApp({
      "App.tsazor": `<img src="@src" alt="@name takes off." title="@missing" /><button disabled="@off">a</button><button disabled>b</button><img src=@src />\n@code {\n    src = "/r.svg";\n    name = "A rocket";\n    missing = null;\n    off = false;\n}`,
    });
    expect(html).toBe('<img src="/r.svg" alt="A rocket takes off."><button>a</button><button disabled="">b</button><img src="/r.svg">');
  });

  it("MarkupString renders HTML — via new and via `as`", async () => {
    const html = await renderApp({
      "App.tsazor": `@import { MarkupString } from "@tsazor/runtime"\n<p>@(new MarkupString(html))</p><p>@(html as MarkupString)</p>\n@code {\n    html = "some <strong>HTML</strong>";\n}`,
    });
    expect(html).toBe("<p>some <strong>HTML</strong></p><p>some <strong>HTML</strong></p>");
  });

  it("components in the same folder resolve without an import; @import works too", async () => {
    expect(await renderApp({ "App.tsazor": "<Nested />", "Nested.tsazor": "<p>n</p>" })).toBe("<p>n</p>");
    expect(await renderApp({ "App.tsazor": '@import Nested from "./Nested.tsazor"\n<Nested />', "Nested.tsazor": "<p>n</p>" })).toBe("<p>n</p>");
  });

  it("scoped CSS stamps the attribute on the file's own elements only", async () => {
    const files = { "App.tsazor": "<p>a</p><Nested />", "App.tsazor.css": "p { color: red; }", "Nested.tsazor": "<p>b</p>" };
    const html = await renderApp(files);
    const [scope] = /b-[0-9a-f]{8}/.exec(html)!;
    expect(html).toBe(`<p ${scope}="">a</p><p>b</p>`);
    expect(buildProject(files).css).toContain(`p[${scope}] { color: red; }`);
    expect(strip(html)).toBe("<p>a</p><p>b</p>");
  });

  it("the CSS walker scopes rules, traverses @media, leaves @keyframes alone", () => {
    const css = scopeCss(
      "/* c { } */\n.a > .b:hover, p::after { color: red; }\n@media (min-width: 1px) { .x ::deep .y { top: 0 } }\n@keyframes k { from { opacity: 0 } to { opacity: 1 } }",
      "b-1",
    );
    expect(css).toContain(".a[b-1] > .b[b-1]:hover, p[b-1]::after {");
    expect(css).toContain(".x[b-1] .y {");
    expect(css).toContain("from { opacity: 0 }");
    expect(css).toContain("/* c { } */");
  });
});

/**
 * @tsazor/markdown: GitHub Flavored Markdown as HTML, never trusted. What could run is removed, links to another
 * origin open in a new tab without access to the page, and the component renders through the compiled pipeline.
 */
import DOMPurify from "dompurify";
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Markdown, renderMarkdown } from "../dist/index.js";

/** The markup without the renderer's boundary comments. */
const markup = (element: Element) => element.innerHTML.replace(/<!--[\s\S]*?-->/g, "");

const html = (markdown: string, options?: Parameters<typeof renderMarkdown>[1]) => {
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown(markdown, options);
  return host;
};

describe("renderMarkdown", () => {
  it("renders GitHub Flavored Markdown: headings, emphasis, lists, tables, task lists, strikethrough, code", () => {
    const host = html([
      "# Title",
      "Some **bold**, _italic_ and ~~gone~~ text with `code`.",
      "",
      "- [x] done",
      "- [ ] open",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "```ts",
      "const x = 1 < 2;",
      "```",
    ].join("\n"));
    expect(host.querySelector("h1")!.textContent).toBe("Title");
    expect(host.querySelector("strong")!.textContent).toBe("bold");
    expect(host.querySelector("em")!.textContent).toBe("italic");
    expect(host.querySelector("del")!.textContent).toBe("gone");
    expect([...host.querySelectorAll("li input[type=checkbox]")].map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
    // Named by the item's text (axe: a form control needs a label).
    expect([...host.querySelectorAll("li input[type=checkbox]")].map((box) => box.getAttribute("aria-label"))).toEqual(["done", "open"]);
    expect([...host.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual(["1", "2"]);
    const code = host.querySelector("pre code")!;
    expect(code.className).toBe("language-ts");
    expect(code.textContent).toBe("const x = 1 < 2;\n");
  });

  it("removes what could run: scripts, event handlers, javascript: links, styles, forms", () => {
    const host = html([
      "<script>alert(1)</script>",
      '<img src="x.png" onerror="alert(2)">',
      "[click](javascript:alert(3))",
      '<a href="javascript:alert(4)">raw</a>',
      '<iframe src="https://evil.example"></iframe>',
      '<p style="position:fixed">styled</p><style>body{display:none}</style>',
      '<form action="https://evil.example"><input name="password"></form>',
    ].join("\n\n"));
    const output = host.innerHTML;
    expect(host.querySelector("script, iframe, style, form")).toBeNull();
    expect(output).not.toMatch(/onerror|javascript:|style=/i);
    expect(host.querySelector("img")!.getAttribute("src")).toBe("x.png");
    expect(host.textContent).toContain("styled");
  });

  it("opens a link to another origin in a new tab without access to the page; a link in the app stays", () => {
    const host = html("[out](https://other.example/a) [in](/docs) [here](#part) [same](" + window.location.origin + "/x)");
    const [out, inner, fragment, same] = [...host.querySelectorAll("a")];
    expect(out!.getAttribute("target")).toBe("_blank");
    expect(out!.getAttribute("rel")).toBe("noopener noreferrer");
    for (const link of [inner, fragment, same]) expect(link!.hasAttribute("target")).toBe(false);
    expect(html("[out](https://other.example/a)", { externalLinks: "same" }).querySelector("a")!.hasAttribute("target")).toBe(false);
    // A target written in the text gets the rel too.
    expect(html('<a href="/docs" target="_blank">x</a>').querySelector("a")!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("breaks, inline, a table class and the allow lists", () => {
    expect(html("one\ntwo", { breaks: true }).querySelector("br")).not.toBeNull();
    expect(html("one\ntwo").querySelector("br")).toBeNull();
    expect(renderMarkdown("**bold** line", { inline: true })).toBe("<strong>bold</strong> line");
    expect(html("| a |\n|---|\n| 1 |", { tableClass: "table table-sm" }).querySelector("table")!.className).toBe("table table-sm");
    expect(html('<iframe src="/embed"></iframe>', { allowTags: ["iframe"] }).querySelector("iframe")).not.toBeNull();
  });

  it("colors fenced code with the app's highlighter, and sanitizes its result", () => {
    const host = html("```js\nlet a\n```", {
      highlight: (code, language) => `<span class="hl-${language}" onclick="alert(1)">${code.trim()}</span>`,
    });
    const span = host.querySelector("pre code.language-js span")!;
    expect(span.className).toBe("hl-js");
    expect(span.hasAttribute("onclick")).toBe(false);
    expect(span.textContent).toBe("let a");
  });

  it("leaves an app's own DOMPurify alone: its hooks are on an instance of its own", () => {
    renderMarkdown("[out](https://other.example)");
    expect(DOMPurify.sanitize('<a href="https://other.example">x</a>')).toBe('<a href="https://other.example">x</a>');
  });
});

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

describe("Markdown", () => {
  it("renders the text into a .tz-markdown div; class appends; inline is a span", async () => {
    const block = await renderTree((b) => {
      b.openComponent(0, Markdown);
      b.addAttribute(1, "value", "Hello *world*");
      b.addAttribute(2, "class", "answer");
      b.closeComponent();
    });
    mounted.push(block);
    await block.renderer.waitUntilIdle();
    const root = block.container.querySelector("div.tz-markdown")!;
    expect(root.className).toBe("tz-markdown answer");
    expect(markup(root)).toBe("<p>Hello <em>world</em></p>\n");
    const line = await renderTree((b) => {
      b.openComponent(0, Markdown);
      b.addAttribute(1, "value", "**x**");
      b.addAttribute(2, "inline", true);
      b.closeComponent();
    });
    mounted.push(line);
    await line.renderer.waitUntilIdle();
    expect(markup(line.container.querySelector("span.tz-markdown")!)).toBe("<strong>x</strong>");
  });

  it("follows a value that grows, as an agent's answer streams in", async () => {
    class Chat extends ComponentBase {
      static last: Chat | undefined;
      text = "Hel";
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        Chat.last = this;
        b.openComponent(0, Markdown);
        b.addAttribute(1, "value", this.text);
        b.addAttribute(2, "breaks", true);
        b.closeComponent();
        b.openElement(3, "button");
        b.addAttribute(4, "onclick", EventCallback.bind(this, () => {
          this.text += "lo\n**there**";
        }));
        b.closeElement();
      }
    }
    const result = await render(Chat);
    mounted.push(result);
    await result.renderer.waitUntilIdle();
    expect(result.container.querySelector(".tz-markdown")!.textContent).toBe("Hel\n");
    result.container.querySelector("button")!.click();
    await result.renderer.waitUntilIdle();
    const root = result.container.querySelector(".tz-markdown")!;
    expect(root.querySelector("br")).not.toBeNull();
    expect(root.querySelector("strong")!.textContent).toBe("there");
  });
});

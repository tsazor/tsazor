/**
 * Layouts stored in the CMS: Scriban's expressions filled in, then the HTML turned into a render tree
 * with live components where the component tags stand.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, Parameter, type RenderTreeBuilder } from "@tsazor/runtime";
import { renderTree } from "@tsazor/testing";
import { buildLayout, parseLayout, type LayoutNode } from "../src/Shell/layout-markup";
import { renderTemplate, TemplateError } from "../src/Shell/scriban";

// The expected texts are Scriban 5.12's (FluentCMS's version), run on the same templates with the
// models FluentCMS hands it: .NET objects (members in snake_case) and dictionaries (keys as they are).
describe("the Scriban subset", () => {
    const model = {
        user: { userName: "", roles: [{ name: "Administrators" }] },
        page: { title: "Home", settings: { MetaTitle: "Welcome" } },
        Items: [{ Id: "a", title: "First" }, { Id: "b", title: "Second" }],
        Item: { Title: "First", FeaturedImage: "", Order: 1, Tags: ["a", "b"], Missing: null, PublishedAt: new Date(2024, 5, 9, 17, 4, 5) },
    };

    it("finds .NET members in snake_case, and a dictionary's keys as they are", () => {
        expect(renderTemplate("<h1>{{ page.title }}</h1>{{page.settings.MetaTitle}}", model)).toBe("<h1>Home</h1>Welcome");
        expect(renderTemplate("{{ user.roles[0].name }}|{{ user.roles.size }}|{{ Item.title }}|{{ user.UserName }}|", model)).toBe("Administrators|1|||");
        expect(() => renderTemplate("{{ Item.Nope.deeper }}", model)).toThrow("Cannot get the member Item.Nope.deeper for a null object");
    });

    it("writes values as Scriban does: dates, lists, booleans, null", () => {
        expect(renderTemplate("{{ true }}|{{ false }}|{{ null }}|{{ 1.5 }}|{{ Item.Order }}|{{ Item.Tags }}|{{ Item.PublishedAt }}", model))
            .toBe('true|false||1.5|1|["a", "b"]|09 Jun 2024');
    });

    it("chooses with if / else if / else; only null and false are false", () => {
        const login = '{{ if user.user_name == "" }}<a href="/auth/login">Log In</a>{{ end }}';
        expect(renderTemplate(login, model)).toBe('<a href="/auth/login">Log In</a>');
        expect(renderTemplate(login, { ...model, user: { userName: "admin" } })).toBe("");
        const which = "{{ if x == 1 }}one{{ else if x == 2 && !(y) }}two{{ else }}other{{ end }}";
        expect([1, 2, 3].map((x) => renderTemplate(which, { x, y: false }))).toEqual(["one", "two", "other"]);
        const truth = '{{ if "" }}a{{ else }}b{{ end }}|{{ if 0 }}a{{ else }}b{{ end }}|{{ if null }}a{{ else }}b{{ end }}|{{ if Item.FeaturedImage }}a{{ else }}b{{ end }}|{{ if Item.Missing }}a{{ else }}b{{ end }}';
        expect(renderTemplate(truth, model)).toBe("a|a|b|a|b");
        expect(renderTemplate('{{ !"" }}|{{ !0 }}|{{ !null }}|{{ "a" && 0 }}|{{ null || "x" }}', model)).toBe("false|false|true|true|true");
        expect(renderTemplate('{{ 1 == 1.0 }}|{{ "1" == 1 }}|{{ 2 > 1 }}|{{ "b" > "a" }}|{{ 1 < "2" }}|{{ Item.Tags.size > 1 }}', model)).toBe("true|true|true|true|true|true");
    });

    it("repeats with for, and trims whitespace beside {{- -}} and {{~ ~}}", () => {
        expect(renderTemplate("{{ for t in Item.Tags }}{{ for.index }}{{ t }}{{ for.last }};{{ end }}", model)).toBe("0afalse;1btrue;");
        const list = "<ul>\n  {{- for item in Items }}\n  <li>{{ item.title }} ({{ item.Id }})</li>\n  {{- end }}\n</ul>";
        expect(renderTemplate(list, model)).toBe("<ul>\n  <li>First (a)</li>\n  <li>Second (b)</li>\n</ul>");
        expect(renderTemplate('x {{- " y " -}} z', model)).toBe("x y z");
        expect(renderTemplate('x {{~ " y " ~}}\n  z', model)).toBe("x y   z");
        expect(renderTemplate('a  {{~ "b" ~}}  \n  c', model)).toBe("ab  c");
        expect(renderTemplate('a\n  {{- "b" -}}  \n  c', model)).toBe("abc");
    });

    it("indents a block's lines by the spaces before its statement (Scriban's auto-indent)", () => {
        const cases: Array<[string, string]> = [
            ["<a>\n    {{ if true }}\n    <div>\n        <img>\n    </div>\n    {{ end }}\n</a>", "<a>\n    \n        <div>\n            <img>\n        </div>\n        \n</a>"],
            ["<a>\n{{ if true }}\n    <div>\n{{ end }}\n</a>", "<a>\n\n    <div>\n\n</a>"],
            ['  {{ "x\ny" }}', "  x\n  y"],
            ['<b>  {{ "x\ny" }}', "<b>  x\ny"],
            ["  {{ for t in Item.Tags }}\n  {{ if true }}\n  a\n  {{ end }}\n  {{ end }}", "  \n    \n    a\n    \n    \n    \n    a\n    \n    "],
            ["\t{{ if true }}\nx\n{{ end }}", "\t\nx\n"],
            ["  {{- if true }}\nx\n{{ end }}", "\nx\n"],
            ['a\n  {{ if true }}{{ "p\nq" }}\nx{{ end }}', "a\n  p\nq\n  x"],
            ["  {{ if false }}\n  x\n    {{ else }}\n  y\n  {{ end }}", "  \n    y\n    "],
            ["z\n  {{ for t in Item.Tags }}{{ t }}\n{{ end }}", "z\n  a\nb\n"],
            ["  {{ if true }}\n\n  y\n  {{ end }}", "  \n  \n    y\n    "],
            ["  {{ if true }}\r\n  y\r\n  {{ end }}", "  \r\n    y\r\n    "],
            ["  {{ for t in Item.Tags }}\n{{ if true }}\n  a\n{{ end }}\n  {{ end }}", "  \n\n  a\n  \n    \n\n  a\n  \n    "],
            ['  {{ "x\ny\n" }}|', "  x\n  y\n|"],
        ];
        expect(cases.map(([template]) => renderTemplate(template, model))).toEqual(cases.map(([, expected]) => expected));
    });

    it("says what it doesn't support", () => {
        expect(() => renderTemplate("{{ page.title | string.upcase }}", model)).toThrow(/pipes/);
        expect(() => renderTemplate("{{ true and false }}", model)).toThrow(TemplateError);
        expect(() => renderTemplate("{{ while true }}{{ end }}", model)).toThrow(TemplateError);
        expect(() => renderTemplate("{{ if true }}open", model)).toThrow(/no "\{\{ end \}\}"/);
        expect(() => renderTemplate("{{ end }}", model)).toThrow(/without a block/);
        expect(() => renderTemplate("{{ page.title", model)).toThrow(/has no "\}\}"/);
        expect(() => renderTemplate("{{ for.index }}", model)).toThrow(/null object/);
    });
});

describe("a stored layout as a render tree", () => {
    it("builds the elements around a component tag, and keeps everything else as markup", () => {
        const { nodes, scripts } = parseLayout(
            '<header><a href="/">Home</a></header>\n<section class="bg"><div class="container"><PluginsSection Name="Main" fluentcms /></div></section>\n<footer>©</footer>\n<script src="/files/js/app.js"></script>',
        );
        const shape = (list: LayoutNode[]): unknown[] =>
            list.map((node) =>
                node.kind === "markup" ? node.html
                : node.kind === "component" ? node.component
                : { [node.name]: Object.fromEntries(node.attributes), children: shape(node.children) },
            );
        expect(shape(nodes)).toEqual([
            '<header><a href="/">Home</a></header>\n',
            { section: { class: "bg" }, children: [{ div: { class: "container" }, children: [{ name: "PluginsSection", attributes: { Name: "Main" } }] }] },
            "\n<footer>©</footer>\n",
        ]);
        expect(scripts).toEqual([{ attributes: [["src", "/files/js/app.js"]], text: "" }]);
    });

    it("doesn't let a component tag swallow what follows it (`/>` closes no HTML element)", () => {
        const { nodes } = parseLayout('<meta charset="utf-8"><PageHead fluentcms /><meta name="author" content="FluentCMS">');
        expect(nodes.map((node) => node.kind)).toEqual(["markup", "component", "markup"]);
        expect(nodes[2]).toEqual({ kind: "markup", html: '<meta name="author" content="FluentCMS">' });
    });

    class Section extends ComponentBase {
        static created = 0;
        @Parameter() name = "";
        constructor() {
            super();
            Section.created++;
        }
        protected override buildRenderTree(b: RenderTreeBuilder): void {
            b.openElement(0, "p");
            b.addContent(1, `section ${this.name}`);
            b.closeElement();
        }
    }
    const resolve = (name: string) => (name.toLowerCase() === "pluginssection" ? Section : undefined);

    it("renders the component inside the elements that hold it, its attributes as parameters (case-insensitive)", async () => {
        let layout = parseLayout('<main class="page"><h1>Title</h1><div><PluginsSection Name="Main" fluentcms /></div></main><Missing fluentcms />');
        Section.created = 0;
        const { container, renderer, rerender } = await renderTree((b) => buildLayout(b, layout.nodes, resolve));
        await renderer.waitUntilIdle();
        expect(container.querySelector("main.page > div > p")?.textContent).toBe("section Main");
        expect(container.querySelector(".f-missing-component")?.textContent).toBe("The layout's component Missing doesn't exist.");

        // The same layout with other text (a Scriban value that changed) keeps the component.
        layout = parseLayout('<main class="page"><h1>Other title</h1><div><PluginsSection Name="Main" fluentcms /></div></main>');
        await rerender();
        expect(container.querySelector("h1")?.textContent).toBe("Other title");
        expect(Section.created).toBe(1);
    });
});

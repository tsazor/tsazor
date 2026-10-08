import type { ComponentType, RenderTreeBuilder } from "@tsazor/runtime";

/**
 * A layout stored in the CMS, as a render tree (FluentCMS's LayoutProcessor and RenderDynamicContent).
 *
 * The layout is HTML. A tag with a `fluentcms` attribute names a component, and its `name="value"`
 * attributes are the component's parameters: `<PluginsSection Name="Main" fluentcms />`.
 *
 * FluentCMS cuts the HTML into segments around the tags and adds each as a MarkupString. That only
 * works because static SSR streams the segments as one text. In the browser each markup is parsed
 * alone, so a `<main>` opened before a tag and closed after it would not contain the component.
 * Here the whole layout is parsed once:
 * - an element that holds a component tag becomes an element of the render tree;
 * - every run of HTML without one stays markup;
 * - scripts are taken out, since markup never runs them; the layout loads them (StoredLayout).
 */
export interface ParsedLayout {
    nodes: LayoutNode[];
    scripts: LayoutScript[];
}

export type LayoutNode =
    | { kind: "markup"; html: string }
    | { kind: "element"; name: string; attributes: Array<[string, string]>; children: LayoutNode[] }
    | { kind: "component"; component: LayoutComponent };

/** A component tag: its name as written, and its attributes, which become the parameters. */
export interface LayoutComponent {
    name: string;
    attributes: Record<string, string>;
}

export interface LayoutScript {
    attributes: Array<[string, string]>;
    text: string;
}

// FluentCMS's patterns: a tag with ` fluentcms`, and its quoted attributes (a bare one, like `fluentcms`, isn't a parameter).
const COMPONENT_TAG = /<(\w+)([^>]*?\sfluentcms(?=[\s/>])[^>]*?)\/?>/gi;
const ATTRIBUTE = /(\w+)=['"]([^'"]*)['"]/g;
// A component tag becomes a comment before parsing: the HTML parser keeps a comment where it stands,
// while `<PageHead />` would open an element that swallows what follows (`/>` closes no HTML element).
const MARKER = /^fluentcms:(\d+)$/;

export function parseLayout(html: string): ParsedLayout {
    const components: LayoutComponent[] = [];
    const marked = html.replace(COMPONENT_TAG, (_tag, name: string, attributes: string) => {
        const parameters: Record<string, string> = {};
        for (const [, key, value] of attributes.matchAll(ATTRIBUTE)) parameters[key!] = value!;
        components.push({ name, attributes: parameters });
        return `<!--fluentcms:${components.length - 1}-->`;
    });

    // A template's content is inert: nothing in it loads or runs while it is taken apart.
    const template = document.createElement("template");
    template.innerHTML = marked;
    const content = template.content;
    const scripts = [...content.querySelectorAll("script")].map((script) => {
        script.remove();
        return { attributes: attributesOf(script), text: script.text };
    });

    // The elements on the way to a component tag.
    const holders = new Set<Node>();
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_COMMENT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (!MARKER.test((node as Comment).data)) continue;
        for (let parent = node.parentNode; parent !== null && parent !== content; parent = parent.parentNode) holders.add(parent);
    }

    const convert = (parent: ParentNode): LayoutNode[] => {
        const nodes: LayoutNode[] = [];
        let markup = "";
        const flush = () => {
            if (markup !== "") nodes.push({ kind: "markup", html: markup });
            markup = "";
        };
        for (const child of parent.childNodes) {
            const marker = child.nodeType === Node.COMMENT_NODE ? MARKER.exec((child as Comment).data) : null;
            if (marker !== null) {
                flush();
                nodes.push({ kind: "component", component: components[Number(marker[1])]! });
            } else if (holders.has(child)) {
                flush();
                const element = child as Element;
                nodes.push({ kind: "element", name: element.localName, attributes: attributesOf(element), children: convert(element) });
            } else markup += serialize(child);
        }
        flush();
        return nodes;
    };
    return { nodes: convert(content), scripts };
}

/**
 * Builds a parsed layout into the render tree. `resolve` finds a tag's component (FluentCMS finds the
 * type by name with reflection; an app has a registry); a tag it doesn't know shows a notice.
 */
export function buildLayout(
    builder: RenderTreeBuilder,
    nodes: readonly LayoutNode[],
    resolve: (name: string) => ComponentType | undefined,
): void {
    // The tree comes from data: a node's sequence is its place among its siblings. All of an element's
    // attributes share one sequence (diffed by name, like splatted ones), so its children keep theirs.
    nodes.forEach((node, index) => {
        const sequence = index + 1;
        if (node.kind === "markup") builder.addMarkupContent(sequence, node.html);
        else if (node.kind === "element") {
            builder.openElement(sequence, node.name);
            for (const [name, value] of node.attributes) builder.addAttribute(0, name, value);
            buildLayout(builder, node.children, resolve);
            builder.closeElement();
        } else {
            const type = resolve(node.component.name);
            if (type === undefined) {
                builder.addMarkupContent(sequence, `<div class="f-missing-component">The layout's component ${escape(node.component.name)} doesn't exist.</div>`);
                return;
            }
            builder.openComponent(sequence, type);
            for (const [name, value] of Object.entries(node.component.attributes)) builder.addAttribute(0, name, value);
            builder.closeComponent();
        }
    });
}

function attributesOf(element: Element): Array<[string, string]> {
    return [...element.attributes].map((attribute) => [attribute.name, attribute.value]);
}

function serialize(node: ChildNode): string {
    if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML;
    if (node.nodeType === Node.COMMENT_NODE) return `<!--${(node as Comment).data}-->`;
    return escape(node.textContent ?? "");
}

function escape(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

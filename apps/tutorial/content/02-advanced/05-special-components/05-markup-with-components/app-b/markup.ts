import type { ComponentType, RenderFragment, RenderTreeBuilder } from "@tsazor/runtime";

/**
 * HTML as a render fragment: parsed once, then written into the builder
 * node by node, with the calls the compiler writes for markup.
 */
export function fromHtml(html: string, components: Record<string, ComponentType> = {}): RenderFragment {
    const template = document.createElement("template");
    template.innerHTML = html;
    return (builder) => write(builder, template.content.childNodes, components);
}

function write(builder: RenderTreeBuilder, nodes: NodeListOf<ChildNode>, components: Record<string, ComponentType>): void {
    // The tree comes from data, so a node's sequence number is its place among its siblings.
    nodes.forEach((node, sequence) => {
        if (node instanceof Element) {
            const component = components[node.localName];
            if (component !== undefined) {
                // A tag the app knows: that component, with the tag's attributes as its parameters.
                builder.openComponent(sequence, component);
                for (const { name, value } of node.attributes) builder.addComponentParameter(0, name, value);
                builder.closeComponent();
                return;
            }
            builder.openElement(sequence, node.localName);
            for (const { name, value } of node.attributes) builder.addAttribute(0, name, value);
            write(builder, node.childNodes, components);
            builder.closeElement();
        } else if (node instanceof Text) {
            builder.addContent(sequence, node.data);
        }
    });
}

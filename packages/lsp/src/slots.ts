/**
 * Named slots (2.3 templated components) in the LSP (2.5): slot-element
 * completion, the `Context` attribute and the fragment's context variable.
 *
 * The classification follows the compiler's rules: a child content element is
 * a DIRECT child of a component element whose metadata names a
 * `RenderFragment`-parameter with the tag's name (nested tags or fragment
 * bodies are not slots, TZS027); a `RenderFragment<T>` slot body (and a
 * component's loose content over a generic `ChildContent`) receives the
 * context variable — its own `Context="x"`, else the component's, else
 * `context`. Without parent metadata nothing counts as a slot (2.2 behavior).
 */
import type { ComponentMetadata, ComponentParameter, DocumentNode, ElementNode, MarkupNode } from "@tsazor/compiler";
import { childNodes } from "@tsazor/compiler";
import type { AnalyzedFile } from "./analysis.js";

/**
 * The nodes containing the position, outermost first (the path from the
 * document body to the deepest containing node). Slots and their fragment
 * bodies are classified through this path, not through the single deepest
 * node: a slot is a direct child of its component, a context variable a
 * local of the enclosing fragment.
 */
export function ancestorChainAt(document: DocumentNode, line: number, character: number): MarkupNode[] {
  const chain: MarkupNode[] = [];
  const visit = (node: MarkupNode): boolean => {
    const startLine = node.pos.line - 1; // compiler lines are 1-based
    const endLine = node.endPos.line - 1;
    if (line < startLine || line > endLine) return false;
    if (line === startLine && character < node.pos.column) return false;
    if (line === endLine && character >= node.endPos.column) return false;
    let descended = false;
    if (node.kind !== "directive") {
      for (const child of childNodes(node)) {
        if (!descended && visit(child)) descended = true;
      }
    }
    chain.unshift(node);
    return true;
  };
  for (const node of document.body) visit(node);
  return chain;
}

/** Metadata of the component a tag resolves to (null unresolved/no manifest). */
export function elementMetadata(analyzed: AnalyzedFile, tag: string): ComponentMetadata | null {
  return analyzed.context.resolveComponentMetadata(tag, [...analyzed.usings], analyzed.ownImports);
}

/** A RenderFragment / RenderFragment<T> parameter: settable by a child content element. */
export function isFragmentParameter(parameter: ComponentParameter): boolean {
  return parameter.category === "RenderFragment" || parameter.category === "RenderFragment<T>";
}

/** The elements containing the position, outermost first. */
export function chainAt(analyzed: AnalyzedFile, line: number, character: number): MarkupNode[] {
  return ancestorChainAt(analyzed.document, line, character);
}

/** The last element of the chain, innermost (the one hosting the cursor —
 *  its opening tag or its content). */
export function innermostElementOf(chain: readonly MarkupNode[]): ElementNode | null {
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i]!;
    if (node.kind === "element") return node as ElementNode;
  }
  return null;
}

/** The nearest element enclosing `element` in `chain` (null at top level). */
export function enclosingElementOf(chain: readonly MarkupNode[], element: ElementNode): ElementNode | null {
  const index = chain.lastIndexOf(element);
  for (let i = index - 1; i >= 0; i--) {
    const node = chain[i]!;
    if (node.kind === "element") return node as ElementNode;
  }
  return null;
}

/**
 * The fragment parameters the direct parent component of the tag being typed
 * offers as slots. `tagNameRegion` true: the cursor sits in the opening tag
 * of the innermost element (the tag itself is being typed — its parent
 * speaks); otherwise the innermost element's content hosts the tag. The
 * direct parent only: inside a slot's fragment body (or nested in markup) a
 * tag cannot name a slot of an outer component (TZS027) — no candidates.
 */
export function fragmentParametersOfParent(analyzed: AnalyzedFile, chain: readonly MarkupNode[], tagNameRegion: boolean): readonly ComponentParameter[] {
  const innermost = innermostElementOf(chain);
  const element = tagNameRegion ? (innermost === null ? null : enclosingElementOf(chain, innermost)) : innermost;
  if (element === null || !element.isComponent) return [];
  const metadata = elementMetadata(analyzed, element.tagName);
  if (metadata === null) return [];
  return metadata.parameters.filter(isFragmentParameter);
}

/**
 * The fragment parameter a (complete) tag names, as a direct child of the
 * component enclosing it — null when the tag is not a slot (no parent
 * metadata, plain HTML parent, unknown name).
 */
export function slotParameterOf(analyzed: AnalyzedFile, chain: readonly MarkupNode[], element: ElementNode): ComponentParameter | null {
  const parent = enclosingElementOf(chain, element);
  if (parent === null || !parent.isComponent) return null;
  const metadata = elementMetadata(analyzed, parent.tagName);
  if (metadata === null) return null;
  return metadata.parameters.find((parameter) => parameter.name === element.tagName && isFragmentParameter(parameter)) ?? null;
}

/** A literal `Context="x"` attribute value (an identifier), or null. */
export function contextNameOf(element: ElementNode): string | null {
  const attribute = element.attributes.find((attr) => (attr.kind === "static" || attr.kind === "expression") && attr.name.toLowerCase() === "context");
  if (!attribute || attribute.kind !== "static") return null;
  const value = attribute.value.trim();
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : null;
}

export interface FragmentContext {
  /** The local variable's name inside the fragment body. */
  name: string;
  /** The `RenderFragment<T>` context type as source text. */
  type: string;
}

/**
 * The context variable in scope at the cursor, if any — the innermost
 * `RenderFragment<T>`-driven template: a slot element's body (its own
 * `Context`, else the component's, else `context`) or a component's loose
 * content (its generic `ChildContent` with the component's `Context`).
 * Nested in a plain `RenderFragment` or markup? Then the search continues
 * outward: the context is a local of the fragment function, TS scoping keeps
 * it visible in nested markup.
 */
export function fragmentContextAt(analyzed: AnalyzedFile, chain: readonly MarkupNode[]): FragmentContext | null {
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i]!;
    if (node.kind !== "element") continue;
    const element = node as ElementNode;

    // A slot element: its body is the fragment — RenderFragment<T> binds the context.
    if (element.isComponent) {
      const parent = enclosingElementOf(chain, element);
      if (parent !== null && parent.isComponent) {
        const parentMetadata = elementMetadata(analyzed, parent.tagName);
        if (parentMetadata !== null) {
          const parameter = parentMetadata.parameters.find((p) => p.name === element.tagName && isFragmentParameter(p));
          if (parameter !== undefined && parameter.category === "RenderFragment<T>") {
            return {
              name: contextNameOf(element) ?? contextNameOf(parent) ?? "context",
              type: parameter.typeArgument ?? "unknown",
            };
          }
        }
      }
    }

    // Loose content of a component: its generic ChildContent binds the context.
    if (element.isComponent) {
      const metadata = elementMetadata(analyzed, element.tagName);
      const child = metadata?.parameters.find((p) => p.name === "ChildContent");
      if (child !== undefined && child.category === "RenderFragment<T>") {
        return { name: contextNameOf(element) ?? "context", type: child.typeArgument ?? "unknown" };
      }
    }
  }
  return null;
}
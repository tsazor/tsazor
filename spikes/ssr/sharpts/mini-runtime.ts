// SSR spike, part 3b (SharpTS): the slice of @tsazor/runtime the compiler's output calls, as a server renderer that
// writes HTML straight away — no frames, no diff, no DOM. Enough for a first, static render of the spike's app:
// parameters (matched case-insensitively, a content block is `ChildContent`), onInitialized/onParametersSet,
// buildRenderTree. Event handlers, keys and render hints are client work and are dropped.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const escapeText = (value: unknown): string => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class EventCallback {
  static bind(_receiver: unknown, _handler: unknown): EventCallback {
    return new EventCallback();
  }
}

/** TC39 decorator; the server render needs no parameter metadata (fields are matched by name). */
export function Parameter(_options?: unknown): (value: unknown, context: unknown) => void {
  return () => {};
}

// Structural, and declared before use: SharpTS 1.0.12 reads a type that names a class before its declaration as a
// different type, so nothing here refers forward (ComponentBase comes last).
type ComponentClass = new () => { renderToString(parameters: Map<string, unknown>): string };

export class RenderTreeBuilder {
  private out: string[] = [];
  /** Open element: its name and whether its start tag still takes attributes. */
  private elements: { name: string; open: boolean }[] = [];
  private component?: { type: ComponentClass; parameters: Map<string, unknown> };

  html(): string {
    return this.out.join("");
  }

  openElement(_sequence: number, name: string): void {
    this.closeStartTag();
    this.out.push(`<${name}`);
    this.elements.push({ name, open: true });
  }

  addAttribute(_sequence: number, name: string, value?: unknown): void {
    if (this.component) {
      this.component.parameters.set(name, value);
      return;
    }
    if (value === null || value === undefined || value === false || typeof value === "function" || typeof value === "object") return;
    this.out.push(value === true ? ` ${name}` : ` ${name}="${escapeText(value).replace(/"/g, "&quot;")}"`);
  }

  addEventHandler(_sequence: number, _name: string, _callback: unknown): void {}

  setKey(_key: unknown): void {}

  /** H2 render hint: the client reuses unchanged keyed rows; the server writes every row. */
  reuseKeyed(_site: unknown, _key: unknown, _values: unknown[]): boolean {
    return false;
  }

  addContent(_sequence: number, content: unknown): void {
    if (this.component) {
      this.component.parameters.set("ChildContent", content);
      return;
    }
    this.closeStartTag();
    if (typeof content === "function") (content as RenderFragment)(this);
    else if (content !== null && content !== undefined) this.out.push(escapeText(content));
  }

  closeElement(): void {
    this.closeStartTag();
    const element = this.elements.pop()!;
    if (!VOID.has(element.name)) this.out.push(`</${element.name}>`);
  }

  openComponent(_sequence: number, type: ComponentClass): void {
    this.closeStartTag();
    this.component = { type, parameters: new Map() };
  }

  closeComponent(): void {
    const component = this.component!;
    this.component = undefined;
    this.out.push(new component.type().renderToString(component.parameters));
  }

  private closeStartTag(): void {
    const element = this.elements[this.elements.length - 1];
    if (element?.open) {
      this.out.push(">");
      element.open = false;
    }
  }
}

// After the class: SharpTS 1.0.12 reads a type that names a class before its declaration as a different type.
export type RenderFragment = (builder: RenderTreeBuilder) => void;

export class ComponentBase {
  protected onInitialized(): void {}
  protected onParametersSet(): void {}
  protected buildRenderTree(_builder: RenderTreeBuilder): void {}

  /** @internal The server render: parameters in, HTML out. */
  renderToString(parameters: Map<string, unknown>): string {
    const self = this as unknown as Record<string, unknown>;
    const fields = new Map<string, string>();
    for (const key of Object.keys(self)) fields.set(key.toLowerCase(), key);
    for (const [name, value] of parameters) self[fields.get(name.toLowerCase()) ?? name] = value;
    this.onInitialized();
    this.onParametersSet();
    const builder = new RenderTreeBuilder();
    this.buildRenderTree(builder);
    return builder.html();
  }
}

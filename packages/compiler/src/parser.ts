import type {
  AttributeNode,
  CodeBlockNode,
  ConditionalBranch,
  DirectiveNode,
  DocumentNode,
  ElementNode,
  ExpressionNode,
  IfNode,
  MarkupNode,
  SwitchCase,
  SwitchNode,
  ForNode,
  SourceSpan,
} from "./ast";
import { EVENT_FLAGS } from "./ast";
import { DiagnosticBag, type SourcePos } from "./diagnostics";
import { TSScanner } from "./scanner";

const DIRECTIVE_NAMES = new Set([
  "page", "layout", "using", "inject", "inherits", "attribute", "typeparam",
]);

const CONTROL_KEYWORDS = new Set(["if", "else", "for", "foreach", "switch", "case", "default"]);

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const isIdPart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
const isIdStart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z_$]/.test(ch);

export function parseDocument(source: string, diagnostics: DiagnosticBag): DocumentNode {
  return new Parser(source, diagnostics).parseDocument();
}

interface ParseStop {
  closeBrace?: boolean;
  closeTag?: string | null;
}

class Parser {
  private readonly locator: (index: number) => SourcePos;
  private readonly ts: TSScanner;
  private i = 0;
  /** Accumulated text between transitions. */
  private textStart = -1;
  private textParts: string[] = [];

  constructor(
    private readonly source: string,
    private readonly diagnostics: DiagnosticBag,
  ) {
    const lineStarts: number[] = [0];
    for (let k = 0; k < source.length; k++) {
      if (source[k] === "\n") lineStarts.push(k + 1);
    }
    this.locator = (index) => {
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid]! <= index) lo = mid;
        else hi = mid - 1;
      }
      const start = lineStarts[lo]!;
      return { line: lo + 1, column: index - start };
    };
    this.ts = new TSScanner(source, this.locator);
  }

  parseDocument(): DocumentNode {
    const body: MarkupNode[] = [];
    this.parseNodes(body, {});
    const directives = body.filter((n): n is DirectiveNode => n.kind === "directive");
    const markup = body.filter((n) => n.kind !== "directive");
    return { directives, body: markup, codeBlocks: [] };
  }

  /** Parses markup nodes until EOF, a `}` or the given closing tag. */
  private parseNodes(out: MarkupNode[], stop: ParseStop, switchContent = false): void {
    const src = this.source;
    this.textStart = -1;
    while (this.i < src.length) {
      const ch = src[this.i]!;

      if (ch === "}") {
        if (stop.closeBrace) {
          this.i++;
          this.flush(out);
          this.skipOwnLine();
          return;
        }
        if (stop.closeTag === null || stop.closeTag === undefined) {
          this.flush(out);
          this.diagnostics.error("TZR003", this.locator(this.i), "Unexpected '}' in markup.");
          this.i++;
          continue;
        }
        // Inside an element's content, braces are literal text (Razor:
        // inline CSS/JSON in markup is fine) — fall through to the text
        // accumulation at the bottom of the loop.
      }

      if (ch === "<") {
        if (src[this.i + 1] === "/") {
          this.flush(out);
          return; // caller matches the closing tag
        }
        if (src.startsWith("<!--", this.i)) {
          this.flush(out);
          const end = src.indexOf("-->", this.i + 4);
          this.i = end < 0 ? src.length : end + 3;
          continue;
        }
        this.flush(out);
        this.parseNode(out);
        continue;
      }

      if (ch === "@" && !switchContent) {
        this.flush(out);
        this.parseTransition(out, switchContent);
        continue;
      }
      if (ch === "@" && switchContent) {
        const wordEnd = this.i + 2;
        let e = wordEnd;
        while (e < src.length && /[A-Za-z0-9_]/.test(src[e]!)) e++;
        const word = src.slice(wordEnd, e);
        if (word === "case" || word === "default") {
          this.flush(out);
          this.pendingSwitchWord = word;
          this.i = e;
          return; // caller (switch body loop) picks it up
        }
        this.flush(out);
        this.parseTransition(out, switchContent);
        continue;
      }

      // Inside a switch body: bare case/default labels and break statements.
      if (switchContent && this.textStart < 0) {
        const m = /^\s*(case\b|default\s*:|break\s*;)/.exec(src.slice(this.i, this.i + 32));
        if (m) {
          this.flush(out);
          const token = m[1]!;
          if (token.startsWith("case")) this.pendingSwitchWord = "case";
          else if (token.startsWith("default")) this.pendingSwitchWord = "default";
          else {
            // break: silently skipped (codegen emits break automatically).
            this.i += m[0].length;
            continue;
          }
          this.i += m[0].length;
          return;
        }
      }

      if (this.textStart < 0) this.textStart = this.i;
      this.textParts.push(ch);
      this.i++;
    }
    this.flush(out);
  }

  private flush(out: MarkupNode[]): void {
    if (this.textStart < 0 || this.textParts.length === 0) return;
    const content = this.textParts.join("");
    out.push({ kind: "text", content, pos: this.locator(this.textStart), endPos: this.locator(this.i) });
    this.textStart = -1;
    this.textParts = [];
  }

  /* ------------------------------------------------------------------ */
  /* @-transitions                                                       */
  /* ------------------------------------------------------------------ */

  private parseTransition(out: MarkupNode[], switchContent: boolean): void {
    const src = this.source;
    const pos = this.locator(this.i);
    const next = src[this.i + 1];

    if (next === "@") {
      this.pushText(out, "@", pos);
      this.i += 2;
      return;
    }

    if (next === ":") {
      // @:line — rest of the line is literal text.
      this.i += 2;
      const nl = src.indexOf("\n", this.i);
      const end = nl < 0 ? src.length : nl;
      this.pushText(out, src.slice(this.i, end), pos);
      this.i = end;
      return;
    }

    if (next === "(") {
      const end = this.ts.scanBalanced(this.i + 1, "(", ")");
      if (end < 0) {
        this.diagnostics.error("TZR003", pos, "Parenthesized expression never closes.");
        this.i = src.length;
        return;
      }
      const node: ExpressionNode = {
        kind: "expression",
        code: src.slice(this.i + 2, end - 1),
        pos,
        endPos: this.locator(end),
      };
      out.push(node);
      this.i = end;
      return;
    }

    if (next === "{") {
      this.parseCodeBlock(out, pos, false);
      return;
    }

    // Identifier transitions.
    if (!isIdStart(next)) {
      this.diagnostics.error("TZR004", pos, "Unexpected character after '@'.");
      this.pushText(out, "@", pos);
      this.i++;
      return;
    }
    const idStart = this.i + 1;
    let idEnd = idStart;
    while (isIdPart(src[idEnd])) idEnd++;
    const word = src.slice(idStart, idEnd);

    if (word === "code" || word === "functions") {
      this.parseCodeBlock(out, pos, true, idEnd);
      return;
    }

    if (CONTROL_KEYWORDS.has(word)) {
      this.parseControl(word, idEnd, out);
      return;
    }

    if (DIRECTIVE_NAMES.has(word)) {
      this.parseDirective(word, idEnd, pos, out);
      this.skipOwnLine();
      return;
    }

    this.parseImplicitExpression(idStart, idEnd, pos, out);
  }

  private parseImplicitExpression(idStart: number, idEnd: number, pos: SourcePos, out: MarkupNode[]): void {
    const end = this.ts.scanImplicitExpression(idStart);
    if (end <= idStart) {
      this.diagnostics.error("TZR004", pos, "Empty implicit expression.");
      this.i = idEnd;
      return;
    }
    out.push({ kind: "expression", code: this.source.slice(idStart, end), pos, endPos: this.locator(end) });
    this.i = end;
  }

  private parseCodeBlock(out: MarkupNode[], pos: SourcePos, member: boolean, from = this.i + 1): void {
    const src = this.source;
    const brace = this.findChar(from, "{");
    if (brace < 0) {
      this.diagnostics.error("TZR006", pos, member ? "@code block missing '{'." : "@{ block missing '{'.");
      this.i = src.length;
      return;
    }
    const close = this.ts.scanBalanced(brace, "{", "}");
    if (close < 0) {
      this.diagnostics.error("TZR006", pos, "Code block never closes.");
      this.i = src.length;
      return;
    }
    const node: CodeBlockNode = {
      kind: "codeBlock",
      code: src.slice(brace + 1, close - 1),
      pos,
      endPos: this.locator(close),
    };
    if (member) node.member = true;
    out.push(node);
    this.i = close;
    this.skipOwnLine();
  }

  /* ------------------------------------------------------------------ */
  /* Directives                                                          */
  /* ------------------------------------------------------------------ */

  private parseDirective(word: string, afterWord: number, pos: SourcePos, out: MarkupNode[]): void {
    let end = this.lineEnd(afterWord);
    const raw = this.source.slice(afterWord, end).trim();
    out.push({ kind: "directive", name: word, value: raw.trim(), pos, endPos: this.locator(end) });
    this.i = end;
  }

  private lineEnd(from: number): number {
    const nl = this.source.indexOf("\n", from);
    return nl < 0 ? this.source.length : nl;
  }

  /* ------------------------------------------------------------------ */
  /* Control structures                                                  */
  /* ------------------------------------------------------------------ */

  private parseControl(word: string, afterWord: number, out: MarkupNode[]): void {
    const pos = this.locator(this.i);
    this.i = afterWord;

    if (word === "if") {
      const condition = this.parseParens(pos);
      const branches: ConditionalBranch[] = [{ condition, children: this.parseBraceMarkupBlock(false) }];
      for (;;) {
        this.skipWhitespace();
        // Razor: `else` follows the block without an @ transition.
        const wordStart = this.i;
        let w = wordStart;
        while (isIdPart(this.source[w])) w++;
        if (this.source.slice(wordStart, w) !== "else") break;
        const elsePos = this.locator(this.i);
        this.i = w;
        this.skipWhitespace();
        let isElseIf = false;
        let condition2: string | null = null;
        if (this.sliceWord(this.i) === "if") {
          isElseIf = true;
          this.i += 2;
          condition2 = this.parseParens(elsePos);
        }
        const children = this.parseBraceMarkupBlock(false);
        branches.push({ condition: isElseIf ? condition2 : null, children, span: { pos: elsePos, endPos: this.locator(this.i) } });
      }
      const node: IfNode = { kind: "if", branches, pos, endPos: this.locator(this.i) };
      out.push(node);
      return;
    }

    if (word === "for" || word === "foreach") {
      const code = this.parseParens(pos);
      const children = this.parseBraceMarkupBlock(false);
      const node: ForNode = { kind: "for", code, isForEach: word === "foreach", children, pos, endPos: this.locator(this.i) };
      out.push(node);
      return;
    }

    if (word === "switch") {
      const code = this.parseParens(pos);
      this.skipWhitespace();
      if (this.source[this.i] !== "{") {
        this.diagnostics.error("TZR006", pos, "@switch requires a '{' block.");
        this.i = this.source.length;
        return;
      }
      const close = this.ts.scanBalanced(this.i, "{", "}", false);
      if (close < 0) {
        this.diagnostics.error("TZR006", pos, "@switch block never closes.");
        this.i = this.source.length;
        return;
      }
      this.i++;
      const cases = this.parseSwitchBody(pos, close);
      out.push({ kind: "switch", code, cases, pos, endPos: this.locator(this.i) } satisfies SwitchNode);
      return;
    }

    this.diagnostics.error("TZR001", pos, `'@${word}' outside of its control context.`);
  }

  private pendingSwitchWord: string | null = null;

  private parseSwitchBody(startPos: SourcePos, closeBrace: number): SwitchCase[] {
    const cases: SwitchCase[] = [];
    let current: SwitchCase | null = null;
    const src = this.source;
    while (this.i < src.length && this.i < closeBrace) {
      const word = this.pendingSwitchWord;
      if (word !== null) {
        this.pendingSwitchWord = null;
        if (word === "default") {
          this.skipWhitespace();
          if (src[this.i] === ":") this.i++;
          current = { code: null, children: [], span: { pos: startPos, endPos: this.locator(this.i) } };
          cases.push(current);
          continue;
        }
        // case
        this.skipWhitespace();
        const code = this.parseCaseExpression();
        this.skipWhitespace();
        if (src[this.i] === ":") this.i++;
        current = { code, children: [], span: { pos: startPos, endPos: this.locator(this.i) } };
        cases.push(current);
        continue;
      }
      const children: MarkupNode[] = [];
      this.parseNodes(children, { closeBrace: true }, true);
      // parseNodes stopped on '}' (consumed) or a case transition; append children.
      const meaningful = children.some((c) => c.kind !== "text" || c.content.trim().length > 0);
      if (current) current.children.push(...children);
      else if (meaningful) cases.push({ code: null, children, span: { pos: startPos, endPos: this.locator(this.i) } });
      if (this.pendingSwitchWord === null) break; // closed the brace
    }
    return cases;
  }

  private parseCaseExpression(): string {
    const src = this.source;
    const ch = src[this.i];
    if (ch === '"' || ch === "'") {
      const end = this.ts.skipStringFor(this.i, ch!);
      const code = src.slice(this.i, end);
      this.i = end;
      return code;
    }
    if (ch === "(") {
      const end = this.ts.scanBalanced(this.i, "(", ")");
      const code = src.slice(this.i + 1, end - 1);
      this.i = end;
      return code;
    }
    const start = this.i;
    const end = this.ts.scanImplicitExpression(this.i);
    this.i = Math.max(end, start + 1);
    return src.slice(start, this.i);
  }

  /* ------------------------------------------------------------------ */
  /* Markup nodes                                                        */
  /* ------------------------------------------------------------------ */

  private parseNode(out: MarkupNode[]): void {
    const src = this.source;
    const pos = this.locator(this.i);
    this.i++; // '<'

    if (src.startsWith("text>", this.i)) {
      this.i += 5;
      const children: MarkupNode[] = [];
      this.parseNodes(children, { closeTag: "text" });
      this.expectCloseTag("text");
      out.push({ kind: "textTag", children, pos, endPos: this.locator(this.i) });
      return;
    }

    const nameStart = this.i;
    while (this.i < src.length && /[A-Za-z0-9_.-]/.test(src[this.i]!)) this.i++;
    const tagName = src.slice(nameStart, this.i);
    if (!tagName) {
      this.diagnostics.error("TZR002", pos, "Expected a tag name after '<'.");
      this.i++;
      return;
    }

    const isComponent = /^[A-Z]/.test(tagName) || tagName.includes(".");
    const attributes = this.parseTagAttributes(pos, tagName);

    let selfClosing = false;
    if (src[this.i] === "/" && src[this.i + 1] === ">") {
      selfClosing = true;
      this.i += 2;
    } else if (src[this.i] === ">") {
      this.i++;
      if (!isComponent && VOID_ELEMENTS.has(tagName.toLowerCase())) selfClosing = true;
    } else {
      this.diagnostics.error("TZR002", pos, `Unclosed start tag '<${tagName}'.`);
      this.i = src.length;
    }

    const node: ElementNode = {
      kind: "element",
      tagName,
      isComponent,
      selfClosing,
      attributes,
      children: [],
      pos,
      endPos: this.locator(this.i),
    };

    if (!selfClosing) {
      const stopTag = isComponent ? tagName : tagName.toLowerCase();
      const children: MarkupNode[] = [];
      if (isComponent) {
        this.parseNodes(children, {});
        this.expectCloseTag(stopTag);
      } else {
        this.parseNodes(children, { closeTag: stopTag });
        this.expectCloseTag(stopTag);
      }
      node.children = children;
    }
    node.endPos = this.locator(this.i);
    out.push(node);
  }

  private expectCloseTag(tagName: string): void {
    const src = this.source;
    const save = this.i;
    this.skipWhitespace();
    if (src.startsWith("</", this.i)) {
      const after = this.i + 2;
      let end = after;
      while (end < src.length && /[A-Za-z0-9_.-]/.test(src[end]!)) end++;
      const closeName = src.slice(after, end);
      if (closeName.toLowerCase() === tagName.toLowerCase()) {
        this.i = end;
        while (end < src.length && src[end] !== ">") end++;
        if (src[end] === ">") this.i = end + 1;
        else this.diagnostics.error("TZR002", this.locator(end), `Missing '>' on closing tag of <${tagName}>.`);
        return;
      }
    }
    this.i = save;
    this.diagnostics.error("TZR002", this.locator(this.i), `Missing closing tag </${tagName}>.`);
  }

  private parseTagAttributes(tagPos: SourcePos, tagName: string): AttributeNode[] {
    const src = this.source;
    const attributes: AttributeNode[] = [];
    for (;;) {
      this.skipWhitespace();
      const ch = src[this.i];
      if (ch === undefined) {
        this.diagnostics.error("TZR002", tagPos, `Start tag <${tagName} is never closed.`);
        return attributes;
      }
      if (ch === ">" || (ch === "/" && src[this.i + 1] === ">")) return attributes;
      const attr = this.parseAttribute();
      if (!attr) continue;
      // Fold a valueless modifier attribute (@onclick:preventDefault) into the
      // preceding handler, like Blazor does.
      if (attr.kind === "eventHandler" && attr.code === "" && attr.name !== "") {
        const base = attr.name.toLowerCase();
        const previous = [...attributes].reverse().find((a) => a.kind === "eventHandler" && a.name.toLowerCase() === base);
        if (previous && previous.kind === "eventHandler" && previous.code !== "") {
          previous.flags |= attr.flags;
          continue;
        }
        if (attr.flags !== 0) {
          this.diagnostics.error("TZR008", attr.pos, `Modifier attribute for '@${attr.name}' has no matching handler.`);
          continue;
        }
      }
      // Fold @bind modifiers (@bind:event, @bind:format, @bind:get, …) into the
      // preceding bind attribute; @bind-Target modifiers fold onto that target.
      // A modifier with no host is kept as a latent host: Blazor allows
      // @bind:get="x" @bind:set="y" without a base @bind.
      if (attr.kind === "bind" && attr.expression === undefined) {
        const modifier = (["event", "format", "get", "set", "after"] as const).find((k) => attr[k] !== undefined);
        const host = [...attributes].reverse().find((a) => {
          if (a.kind !== "bind") return false;
          return (a as Extract<AttributeNode, { kind: "bind" }>).bindTarget === attr.bindTarget;
        }) as (Extract<AttributeNode, { kind: "bind" }> & Record<string, unknown>) | undefined;
        if (host && modifier && host[modifier] !== undefined) {
          const label = attr.bindTarget !== undefined ? `@bind-${attr.bindTarget}:${modifier}` : `@bind:${modifier}`;
          this.diagnostics.error("TZR008", attr.pos, `Duplicate bind modifier '${label}'.`);
          continue;
        }
        if (host && modifier) {
          host[modifier] = attr[modifier];
          continue;
        }
        // No host (or unknown modifier): keep the node; codegen reports a
        // precise error if it never becomes a usable bind.
        attributes.push(attr);
        continue;
      }
      attributes.push(attr);
    }
  }

  private parseAttribute(): AttributeNode | null {
    const src = this.source;
    const pos = this.locator(this.i);
    const nameStart = this.i;
    while (this.i < src.length && /[A-Za-z0-9_@:.-]/.test(src[this.i]!)) this.i++;
    const name = src.slice(nameStart, this.i);
    if (!name) {
      this.diagnostics.error("TZR009", pos, "Invalid attribute name.");
      this.i++;
      return null;
    }

    const hasValue = src[this.i] === "=";
    if (name.startsWith("@")) {
      // Directive attributes handle their own '=' and valueless forms.
      return this.parseDirectiveAttribute(name, pos);
    }
    if (!hasValue) {
      return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
    }
    this.i++; // '='

    const value = this.parseAttributeValue();
    if (value === null) return null;

    if (value.kind === "parts") {
      if (value.parts.length === 1 && value.parts[0]!.code !== undefined) {
        return { kind: "expression", name, code: value.parts[0]!.code!, pos, endPos: this.locator(this.i) };
      }
      if (value.parts.length === 1 && value.parts[0]!.text !== undefined) {
        return { kind: "static", name, value: value.parts[0]!.text!, pos, endPos: this.locator(this.i) };
      }
      return { kind: "mixedValue", name, parts: value.parts, pos, endPos: this.locator(this.i) };
    }
    return { kind: "expression", name, code: value.code, pos, endPos: this.locator(this.i) };
  }

  private finishValuelessAttribute(name: string, pos: SourcePos): AttributeNode {
    if (name.startsWith("@")) {
      return this.parseDirectiveAttribute(name, pos);
    }
    return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
  }

  /** Attributes starting with @: key, ref, event handlers, splat, bind (M5).
   *  Handles the optional '=' and valueless forms itself. */
  private parseDirectiveAttribute(name: string, pos: SourcePos): AttributeNode {
    const src = this.source;
    const body = name.slice(1);

    if (body === "key" || body === "ref" || body === "attributes") {
      const code = this.parseRequiredExpression(body, pos);
      if (code === null) return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
      const kind = body === "key" ? "key" : body === "ref" ? "ref" : "attributes";
      return { kind, code, pos, endPos: this.locator(this.i) } as AttributeNode;
    }

    // Event handler: @onclick / @onchange with optional :modifier parts.
    if (/^on[A-Za-z]/i.test(body)) {
      const [base, ...modifiers] = body.split(":");
      let flags = 0;
      let modifierOnly = false;
      for (const mod of modifiers) {
        if (mod.toLowerCase() === "preventdefault") { flags |= EVENT_FLAGS.preventDefault; modifierOnly = true; }
        else if (mod.toLowerCase() === "stoppropagation") { flags |= EVENT_FLAGS.stopPropagation; modifierOnly = true; }
        else this.diagnostics.error("TZR008", pos, `Unknown event modifier ':${mod}'.`);
      }
      const hasValue = src[this.i] === "=";
      if (!hasValue) {
        if (modifierOnly) {
          return { kind: "eventHandler", name: base!, code: "", flags, pos, endPos: this.locator(this.i) };
        }
        this.diagnostics.error("TZR008", pos, `'@${base}' without a handler value.`);
        return { kind: "eventHandler", name: base!, code: "", flags, pos, endPos: this.locator(this.i) };
      }
      this.i++;
      const code = this.parseRequiredExpression(base!, pos);
      if (code === null) return { kind: "eventHandler", name: base!, code: "", flags, pos, endPos: this.locator(this.i) };
      return { kind: "eventHandler", name: base!, code, flags, pos, endPos: this.locator(this.i) };
    }

    if (body.startsWith("bind")) {
      return this.parseBindAttribute(body, name, pos);
    }

    this.diagnostics.error("TZR001", pos, `Unknown directive attribute '@${body}'.`);
    if (src[this.i] === "=") this.i++;
    this.parseAttributeValue();
    return { kind: "static", name, value: "", pos, endPos: this.locator(this.i) };
  }

  /**
   * Parses the @bind family: @bind, @bind:event/:format/:get/:set/:after and
   * @bind-<Target> (+ target modifiers). Modifier-only nodes carry exactly
   * one detail field and are folded into the preceding bind attribute by
   * parseTagAttributes (like event modifier attributes).
   */
  private parseBindAttribute(body: string, name: string, pos: SourcePos): AttributeNode {
    const src = this.source;
    const rest = body.slice(4); // after "bind"
    const end = (): SourceSpan => ({ pos, endPos: this.locator(this.i) });

    // @bind="expr"
    if (rest === "") {
      const expression = this.parseRequiredExpression("bind", pos);
      return { kind: "bind", expression: expression ?? "", ...end() };
    }

    // @bind-<Target>[:event|:format] — component parameter binding.
    if (rest.startsWith("-")) {
      const target = rest.slice(1);
      const colon = target.indexOf(":");
      const targetName = colon >= 0 ? target.slice(0, colon) : target;
      const modifier = colon >= 0 ? target.slice(colon + 1).toLowerCase() : undefined;
      if (targetName.length === 0) {
        this.diagnostics.error("TZR008", pos, "'@bind-' requires a parameter name (e.g. '@bind-Value').");
        if (src[this.i] === "=") this.i++;
        this.parseAttributeValue();
        return { kind: "bind", ...end() };
      }
      if (modifier === undefined) {
        const expression = this.parseRequiredExpression(`bind-${targetName}`, pos);
        return { kind: "bind", bindTarget: targetName, expression: expression ?? "", ...end() };
      }
      if (modifier === "event" || modifier === "format") {
        const value = this.parseRequiredExpression(`bind-${targetName}:${modifier}`, pos) ?? "";
        return { kind: "bind", bindTarget: targetName, [modifier]: value, ...end() };
      }
      this.diagnostics.error("TZR008", pos, `Unknown bind modifier '@bind-${targetName}:${modifier}'.`);
      if (src[this.i] === "=") this.i++;
      this.parseAttributeValue();
      return { kind: "bind", ...end() };
    }

    // @bind:event / @bind:format / @bind:get / @bind:set / @bind:after
    if (rest.startsWith(":")) {
      const modifier = rest.slice(1);
      const known = ["event", "format", "get", "set", "after"];
      if (!known.includes(modifier.toLowerCase())) {
        this.diagnostics.error("TZR008", pos, `Unknown bind modifier '@bind:${modifier}'.`);
        if (src[this.i] === "=") this.i++;
        this.parseAttributeValue();
        return { kind: "bind", ...end() };
      }
      const value = this.parseRequiredExpression(`bind:${modifier}`, pos) ?? "";
      return { kind: "bind", [modifier.toLowerCase()]: value, ...end() } as AttributeNode;
    }

    this.diagnostics.error("TZR008", pos, `Invalid '@${name}' attribute.`);
    if (src[this.i] === "=") this.i++;
    this.parseAttributeValue();
    return { kind: "bind", ...end() };
  }

  private parseRequiredExpression(attrName: string, pos: SourcePos): string | null {
    const src = this.source;
    if (src[this.i] === "=") this.i++;
    const value = this.parseAttributeValue();
    if (value === null) {
      this.diagnostics.error("TZR009", pos, `Attribute '@${attrName}' requires a value.`);
      return null;
    }
    // Directive attributes take expressions: a quoted plain value is the
    // expression source itself (Blazor's @onclick="Increment" style).
    if (value.kind === "code") return value.code;
    if (value.kind === "parts" && value.parts.length === 1) {
      const part = value.parts[0]!;
      if (part.code !== undefined) return part.code;
      if (part.text !== undefined) return part.text;
    }
    this.diagnostics.error("TZR009", pos, `Attribute '@${attrName}' requires a single expression value.`);
    return null;
  }

  private parseAttributeValue(): { kind: "code"; code: string } | { kind: "parts"; parts: Array<{ text?: string; code?: string }> } | null {
    const src = this.source;
    if (src[this.i] === "@") {
      // Unquoted expression value.
      const end = this.ts.scanImplicitExpression(this.i + 1);
      if (end <= this.i + 1 && src[this.i + 1] !== "(") {
        this.diagnostics.error("TZR009", this.locator(this.i), "Expected an expression value.");
        return null;
      }
      const code = src.slice(this.i + 1, end);
      this.i = end;
      return { kind: "code", code };
    }
    const quote = src[this.i];
    if (quote !== '"' && quote !== "'") {
      this.diagnostics.error("TZR009", this.locator(this.i), "Expected a quoted attribute value.");
      return null;
    }
    this.i++;
    const parts: Array<{ text?: string; code?: string }> = [];
    let textBuf = "";
    const pushText = (): void => {
      if (textPartsBuffer.length > 0) parts.push({ text: textPartsBuffer.join("") });
      textPartsBuffer.length = 0;
    };
    const textPartsBuffer: string[] = [];
    while (this.i < src.length && src[this.i] !== quote) {
      const ch = src[this.i]!;
      if (ch === "@") {
        if (src[this.i + 1] === "@") {
          textPartsBuffer.push("@");
          this.i += 2;
          continue;
        }
        if (src[this.i + 1] === "(") {
          const end = this.ts.scanBalanced(this.i + 1, "(", ")");
          if (end < 0) {
            this.diagnostics.error("TZR003", this.locator(this.i), "Parenthesized attribute expression never closes.");
            this.i = src.length;
            return null;
          }
          pushText();
          parts.push({ code: src.slice(this.i + 2, end - 1) });
          this.i = end;
          continue;
        }
        if (isIdStart(src[this.i + 1])) {
          const idStart = this.i + 1;
          const end = this.ts.scanImplicitExpression(idStart);
          pushText();
          parts.push({ code: src.slice(idStart, end) });
          this.i = end;
          continue;
        }
      }
      textPartsBuffer.push(ch);
      this.i++;
    }
    if (src[this.i] !== quote) {
      this.diagnostics.error("TZR009", this.locator(this.i), "Attribute value is never closed.");
      this.i = src.length;
      return null;
    }
    this.i++;
    pushText();
    if (parts.length === 0) return { kind: "code", code: "" };
    return { kind: "parts", parts };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  private parseParens(pos: SourcePos): string {
    this.skipWhitespace();
    if (this.source[this.i] !== "(") {
      this.diagnostics.error("TZR003", pos, "Expected '(' after control keyword.");
      this.i = this.source.length;
      return "";
    }
    const end = this.ts.scanBalanced(this.i, "(", ")");
    if (end < 0) {
      this.diagnostics.error("TZR003", pos, "Control condition never closes.");
      this.i = this.source.length;
      return "";
    }
    const code = this.source.slice(this.i + 1, end - 1);
    this.i = end;
    return code.trim();
  }

  private parseBraceMarkupBlock(switchContent: boolean): MarkupNode[] {
    this.skipWhitespace();
    if (this.source[this.i] === "{") {
      const close = this.ts.scanBalanced(this.i, "{", "}", false);
      if (close < 0) {
        this.diagnostics.error("TZR006", this.locator(this.i), "Control statement braces never close.");
        this.i = this.source.length;
        return [];
      }
      const children: MarkupNode[] = [];
      this.i++;
      this.parseNodes(children, { closeBrace: true }, switchContent);
      return children;
    }
    // Single-node body without braces.
    const save = this.i;
    const children: MarkupNode[] = [];
    if (this.source[this.i] === "<") {
      this.parseNode(children);
      if (children.length > 0) return children;
    }
    this.i = save;
    this.diagnostics.error("TZR006", this.locator(this.i), "Expected '{' after control statement.");
    this.i = this.source.length;
    return [];
  }

  private skipWhitespace(): void {
    while (this.i < this.source.length && /\s/.test(this.source[this.i]!)) this.i++;
  }

  private skipOwnLine(): void {
    // A directive/code/control statement "owns" its trailing whitespace up to
    // and including the line break (Razor-style trimming).
    let i = this.i;
    while (i < this.source.length && /[ \t]/.test(this.source[i]!)) i++;
    if (this.source[i] === "\n") {
      this.i = i + 1;
      if (this.source[this.i] === "\r") this.i++;
    } else if (this.source[i] === "\r") {
      this.i = i + 1;
      if (this.source[this.i] === "\n") this.i++;
    }
  }

  private sliceWord(at: number): string {
    let end = at;
    while (isIdPart(this.source[end])) end++;
    return this.source.slice(at, end);
  }

  private startsWithAt(from: number, needle: string): boolean {
    return this.source.startsWith(needle, from);
  }

  private findChar(from: number, ch: string): number {
    let i = from;
    while (i < this.source.length && this.source[i] !== ch) i++;
    return i;
  }

  private pushText(out: MarkupNode[], content: string, pos: SourcePos): void {
    out.push({ kind: "text", content, pos, endPos: this.locator(this.i) });
  }
}
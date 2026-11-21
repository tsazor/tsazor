import { formatValue } from "@tsazor/runtime";

/**
 * The part of Scriban (https://github.com/scriban/scriban) that FluentCMS's layouts and content templates
 * use, for the browser. FluentCMS fills them in on the server with Scriban 5.12, which has no JavaScript
 * port. Checked against Scriban 5.12 itself (test/layout.test.ts names the cases).
 *
 * A template is text with `{{ … }}` blocks:
 * - an expression, whose value is written out as it is (Scriban doesn't escape HTML). A date is written
 *   as `09 Jun 2024`, a list as `["a", "b"]`;
 * - `if <expr>` … `else if <expr>` … `else` … `end`;
 * - `for <name> in <expr>` … `end`, with `for.index`, `for.first` and `for.last` inside;
 * - `{{-` and `-}}` drop all the whitespace beside the block; `{{~` the spaces before it on its line,
 *   `~}}` the spaces after it up to and with the line break.
 *
 * Expressions: literals, member paths (`page.title`, `items[0]`), `==` `!=` `<` `>` `<=` `>=`, `&&`,
 * `||`, `!`, parentheses. Members are found as Scriban finds them on .NET objects: `user.user_name` is
 * the model's `userName` (Scriban names .NET members in snake_case), and a dictionary's key is used as
 * it is. Only `null` and `false` are false (`""` and `0` are true), and a member of null is an error.
 * Anything else (pipes and functions among them) is a TemplateError that names it.
 */

export class TemplateError extends Error {
    override readonly name = "TemplateError";
}

/** Fills in a template with a model. Throws a TemplateError for what this subset doesn't know. */
export function renderTemplate(template: string, model: Readonly<Record<string, unknown>>): string {
    const nodes = parse(split(template));
    let out = "";
    let lineEnded = false;
    run(nodes, [model as Record<string, unknown>], (chunk, indent, isText) => {
        if (chunk === "") return;
        // A text that goes on after a line break someone else wrote starts with the indent too.
        out += (isText && lineEnded ? indent : "") + indentLines(chunk, indent);
        lineEnded = chunk.endsWith("\n");
    });
    return out;
}

/** Writes a chunk of the output: a template's text, or an expression's value. */
type Writer = (chunk: string, indent: string, isText: boolean) => void;

// ── Template structure ───────────────────────────────────────────────────────────────────────────

/** `indent`: the spaces before a block at the start of its line (Scriban's auto-indent, see run). */
type Part = { kind: "text"; text: string } | { kind: "code"; code: string; indent: string };

type TemplateNode =
    | { kind: "text"; text: string }
    | { kind: "output"; expr: Expr; indent: string }
    | { kind: "if"; indent: string; branches: Array<{ test: Expr | null; body: TemplateNode[] }> }
    | { kind: "for"; indent: string; name: string; list: Expr; body: TemplateNode[] };

/** Text and `{{ … }}` blocks, with the whitespace control applied to the text. */
function split(template: string): Part[] {
    const parts: Part[] = [];
    let index = 0;
    let trimNext: "-" | "~" | undefined;
    while (index < template.length) {
        const open = template.indexOf("{{", index);
        let text = template.slice(index, open < 0 ? undefined : open);
        if (trimNext === "-") text = text.trimStart();
        if (trimNext === "~") text = text.replace(/^[ \t]*(\r?\n)?/, "");
        trimNext = undefined;
        if (open < 0) {
            parts.push({ kind: "text", text });
            break;
        }
        const close = template.indexOf("}}", open + 2);
        if (close < 0) throw new TemplateError(`A "{{" has no "}}": ${template.slice(open, open + 30)}`);
        let code = template.slice(open + 2, close);
        if (code.startsWith("-")) text = text.trimEnd();
        if (code.startsWith("~")) text = text.replace(/[ \t]*$/, "");
        if (code.startsWith("-") || code.startsWith("~")) code = code.slice(1);
        if (code.endsWith("-") || code.endsWith("~")) {
            trimNext = code.endsWith("-") ? "-" : "~";
            code = code.slice(0, -1);
        }
        // At the start of its line after spaces (a tab doesn't count): those spaces are its indent.
        const indent = (/\n( +)$/.exec(text) ?? (parts.length === 0 ? /^( +)$/.exec(text) : null))?.[1] ?? "";
        parts.push({ kind: "text", text }, { kind: "code", code: code.trim(), indent });
        index = close + 2;
    }
    return parts.filter((part) => part.kind === "code" || part.text !== "");
}

function parse(parts: Part[]): TemplateNode[] {
    const root: TemplateNode[] = [];
    // The open blocks; each knows where its current body goes.
    const open: Array<{ node: TemplateNode & { kind: "if" | "for" }; body: TemplateNode[] }> = [];
    const body = () => open.at(-1)?.body ?? root;
    for (const part of parts) {
        if (part.kind === "text") {
            body().push(part);
            continue;
        }
        const code = part.code;
        if (code === "" || code.startsWith("#")) continue;
        // A statement's keyword stands alone: `for.index` is an expression.
        const [keyword = ""] = /^[a-z]+(?=\s|$)/.exec(code) ?? [];
        const rest = code.slice(keyword.length).trim();
        if (keyword === "if") {
            const node: TemplateNode & { kind: "if" } = { kind: "if", indent: part.indent, branches: [{ test: parseExpression(rest), body: [] }] };
            body().push(node);
            open.push({ node, body: node.branches[0]!.body });
        } else if (keyword === "else") {
            const block = open.at(-1);
            if (block?.node.kind !== "if") throw new TemplateError(`"{{ ${code} }}" without an "if"`);
            const elseIf = /^if\s+(.+)$/s.exec(rest);
            if (elseIf === null && rest !== "") throw new TemplateError(`Not supported: "{{ ${code} }}"`);
            const branch = { test: elseIf === null ? null : parseExpression(elseIf[1]!), body: [] as TemplateNode[] };
            block.node.branches.push(branch);
            block.body = branch.body;
        } else if (keyword === "for") {
            const match = /^([A-Za-z_]\w*)\s+in\s+(.+)$/s.exec(rest);
            if (match === null) throw new TemplateError(`Not supported: "{{ ${code} }}" (only "for <name> in <list>")`);
            const node: TemplateNode & { kind: "for" } = { kind: "for", indent: part.indent, name: match[1]!, list: parseExpression(match[2]!), body: [] };
            body().push(node);
            open.push({ node, body: node.body });
        } else if (keyword === "end" && rest === "") {
            if (open.pop() === undefined) throw new TemplateError(`"{{ end }}" without a block`);
        } else if (["while", "case", "when", "capture", "func", "with", "wrap", "tablerow", "include", "ret", "break", "continue"].includes(keyword)) {
            throw new TemplateError(`Not supported: "{{ ${code} }}"`);
        } else {
            body().push({ kind: "output", expr: parseExpression(code), indent: part.indent });
        }
    }
    if (open.length > 0) throw new TemplateError(`"{{ ${open.at(-1)!.node.kind} … }}" has no "{{ end }}"`);
    return root;
}

type Scope = Record<string, unknown>;

/**
 * Scriban's auto-indent: a block whose statement starts its line after spaces indents the lines of its
 * text by them (the innermost block's; `else` keeps the `if`'s), and so does an expression its value's.
 * A line break at the end of a chunk is indented only when the block's text goes on after it.
 */
function run(nodes: readonly TemplateNode[], scopes: Scope[], write: Writer, blockIndent = ""): void {
    for (const node of nodes) {
        if (node.kind === "text") write(node.text, blockIndent, true);
        else if (node.kind === "output") write(text(evaluate(node.expr, scopes)), node.indent, false);
        else if (node.kind === "if") {
            const branch = node.branches.find((candidate) => candidate.test === null || truthy(evaluate(candidate.test, scopes)));
            if (branch !== undefined) run(branch.body, scopes, write, node.indent);
        } else {
            const list = evaluate(node.list, scopes);
            if (list === null || list === undefined) continue;
            if (typeof list !== "object" || !(Symbol.iterator in list)) throw new TemplateError(`"for ${node.name} in …" needs a list`);
            const items = [...(list as Iterable<unknown>)];
            items.forEach((item, index) => {
                const loop = { index, first: index === 0, last: index === items.length - 1 };
                run(node.body, [...scopes, { for: loop, [node.name]: item }], write, node.indent);
            });
        }
    }
}

function indentLines(text: string, indent: string): string {
    return indent === "" ? text : text.replace(/\n(?!$)/g, `\n${indent}`);
}

// ── Values ───────────────────────────────────────────────────────────────────────────────────────

/** Scriban: only null and false are false. */
function truthy(value: unknown): boolean {
    return value !== null && value !== undefined && value !== false;
}

function text(value: unknown): string {
    if (value === null || value === undefined) return "";
    // Scriban's date.format.
    if (value instanceof Date) return formatValue(value, "dd MMM yyyy");
    if (Array.isArray(value)) return `[${value.map(listItem).join(", ")}]`;
    return String(value);
}

/** A value in a list as Scriban writes it: a string in quotes. */
function listItem(value: unknown): string {
    if (value === null || value === undefined) return "null";
    return typeof value === "string" ? JSON.stringify(value) : text(value);
}

/** A member as Scriban finds it: the name as it is (a dictionary's key), then snake_case as camelCase. */
function member(target: unknown, name: string): unknown {
    if (target === null || target === undefined) return null;
    if (name === "size" && (typeof target === "string" || Array.isArray(target))) return target.length;
    if (typeof target !== "object") return null;
    const record = target as Record<string, unknown>;
    for (const key of [name, name.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())]) {
        if (key in record && typeof record[key] !== "function") return record[key] ?? null;
    }
    return null;
}

/** Scriban converts a string to a number to compare it with one (`"1" == 1`), and compares dates by time. */
function comparable(left: unknown, right: unknown): [unknown, unknown] {
    if (typeof left === "number" && typeof right === "string" && right.trim() !== "") return [left, Number(right)];
    if (typeof left === "string" && typeof right === "number" && left.trim() !== "") return [Number(left), right];
    if (left instanceof Date && right instanceof Date) return [left.getTime(), right.getTime()];
    return [left ?? null, right ?? null];
}

function same(left: unknown, right: unknown): boolean {
    const [l, r] = comparable(left, right);
    return l === r;
}

function compare(left: unknown, right: unknown, operator: string): boolean {
    const [l, r] = comparable(left, right);
    if (!((typeof l === "number" && typeof r === "number") || (typeof l === "string" && typeof r === "string"))) {
        throw new TemplateError(`"${operator}" compares two numbers or two strings, not ${text(left) || "null"} and ${text(right) || "null"}`);
    }
    switch (operator) {
        case "<": return l < r;
        case ">": return l > r;
        case "<=": return l <= r;
        default: return l >= r;
    }
}

// ── Expressions ──────────────────────────────────────────────────────────────────────────────────

type Expr =
    | { kind: "literal"; value: unknown }
    | { kind: "name"; name: string }
    | { kind: "member"; target: Expr; name: string }
    | { kind: "index"; target: Expr; index: Expr }
    | { kind: "not"; operand: Expr }
    | { kind: "binary"; operator: string; left: Expr; right: Expr };

function evaluate(expr: Expr, scopes: readonly Scope[]): unknown {
    switch (expr.kind) {
        case "literal": return expr.value;
        case "name": {
            for (let i = scopes.length - 1; i > 0; i--) if (expr.name in scopes[i]!) return scopes[i]![expr.name];
            return member(scopes[0], expr.name);
        }
        case "member":
        case "index": {
            const target = evaluate(expr.target, scopes);
            if (target === null || target === undefined) throw new TemplateError(`Cannot get the member ${describe(expr)} for a null object`);
            if (expr.kind === "member") return member(target, expr.name);
            const index = evaluate(expr.index, scopes);
            if (Array.isArray(target) && typeof index === "number") return target.at(index) ?? null;
            return typeof index === "string" ? member(target, index) : null;
        }
        case "not": return !truthy(evaluate(expr.operand, scopes));
        case "binary": {
            const left = evaluate(expr.left, scopes);
            if (expr.operator === "&&") return truthy(left) && truthy(evaluate(expr.right, scopes));
            if (expr.operator === "||") return truthy(left) || truthy(evaluate(expr.right, scopes));
            const right = evaluate(expr.right, scopes);
            if (expr.operator === "==") return same(left, right);
            if (expr.operator === "!=") return !same(left, right);
            return compare(left, right, expr.operator);
        }
    }
}

/** A member path as written, for messages. */
function describe(expr: Expr): string {
    switch (expr.kind) {
        case "name": return expr.name;
        case "member": return `${describe(expr.target)}.${expr.name}`;
        case "index": return `${describe(expr.target)}[…]`;
        default: return "(…)";
    }
}

type Token = { kind: "string" | "number" | "name" | "symbol"; text: string; value?: unknown };

const SYMBOLS = ["==", "!=", "<=", ">=", "&&", "||", "<", ">", "!", "(", ")", "[", "]", "."];

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    while (index < source.length) {
        const rest = source.slice(index);
        const space = /^\s+/.exec(rest);
        if (space !== null) {
            index += space[0].length;
            continue;
        }
        const quote = rest[0];
        if (quote === '"' || quote === "'") {
            let value = "";
            let i = 1;
            for (; i < rest.length && rest[i] !== quote; i++) {
                if (rest[i] === "\\" && i + 1 < rest.length) {
                    const escaped = rest[++i]!;
                    value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
                } else value += rest[i];
            }
            if (i >= rest.length) throw new TemplateError(`A string has no closing ${quote}: ${source}`);
            tokens.push({ kind: "string", text: rest.slice(0, i + 1), value });
            index += i + 1;
            continue;
        }
        const number = /^\d+(\.\d+)?/.exec(rest);
        if (number !== null) {
            tokens.push({ kind: "number", text: number[0], value: Number(number[0]) });
            index += number[0].length;
            continue;
        }
        const name = /^[A-Za-z_]\w*/.exec(rest);
        if (name !== null) {
            tokens.push({ kind: "name", text: name[0] });
            index += name[0].length;
            continue;
        }
        const symbol = SYMBOLS.find((candidate) => rest.startsWith(candidate));
        if (symbol === undefined) {
            throw new TemplateError(rest[0] === "|" ? `Not supported: pipes ("${source}")` : `Not supported: "${rest[0]}" in "${source}"`);
        }
        tokens.push({ kind: "symbol", text: symbol });
        index += symbol.length;
    }
    return tokens;
}

function parseExpression(source: string): Expr {
    const tokens = tokenize(source);
    let position = 0;
    const peek = () => tokens[position];
    const accept = (...texts: string[]): string | undefined => {
        const token = peek();
        if (token !== undefined && token.kind !== "string" && texts.includes(token.text)) {
            position++;
            return token.text;
        }
        return undefined;
    };
    const fail = (): never => {
        const token = peek();
        throw new TemplateError(token === undefined ? `"${source}" ends too early` : `Not supported: "${token.text}" in "${source}"`);
    };

    const or = (): Expr => {
        let left = and();
        while (accept("||") !== undefined) left = { kind: "binary", operator: "||", left, right: and() };
        return left;
    };
    const and = (): Expr => {
        let left = not();
        while (accept("&&") !== undefined) left = { kind: "binary", operator: "&&", left, right: not() };
        return left;
    };
    const not = (): Expr => (accept("!") !== undefined ? { kind: "not", operand: not() } : comparison());
    const comparison = (): Expr => {
        const left = path();
        const operator = accept("==", "!=", "<", ">", "<=", ">=");
        return operator === undefined ? left : { kind: "binary", operator, left, right: path() };
    };
    const path = (): Expr => {
        let expr = primary();
        for (;;) {
            if (accept(".") !== undefined) {
                const token = peek();
                if (token?.kind !== "name") fail();
                position++;
                expr = { kind: "member", target: expr, name: token!.text };
            } else if (accept("[") !== undefined) {
                expr = { kind: "index", target: expr, index: or() };
                if (accept("]") === undefined) fail();
            } else return expr;
        }
    };
    const primary = (): Expr => {
        const token = peek();
        if (token === undefined) return fail();
        if (accept("(") !== undefined) {
            const inner = or();
            if (accept(")") === undefined) fail();
            return inner;
        }
        position++;
        if (token.kind === "string" || token.kind === "number") return { kind: "literal", value: token.value };
        if (token.kind === "name") {
            if (token.text === "true" || token.text === "false") return { kind: "literal", value: token.text === "true" };
            if (token.text === "null") return { kind: "literal", value: null };
            if (peek()?.kind === "name" || peek()?.kind === "string" || peek()?.kind === "number") {
                throw new TemplateError(`Not supported: function calls ("${source}")`);
            }
            return { kind: "name", name: token.text };
        }
        position--;
        return fail();
    };

    const expr = or();
    if (position < tokens.length) fail();
    return expr;
}

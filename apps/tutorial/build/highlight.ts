/**
 * Build-time syntax highlighting for the code blocks of the lesson text —
 * the same tokenizers the editor uses (the `.tsazor` stream mode, the lezer
 * TypeScript and CSS grammars), emitted as `tok-*` classes.
 */
import { StringStream } from "@codemirror/language";
import { typescriptLanguage } from "@codemirror/lang-javascript";
import { cssLanguage } from "@codemirror/lang-css";
import { highlightCode } from "@lezer/highlight";
import { startState, token } from "../src/editor/tsazor-mode.js";
import { classForToken, tutorialHighlighter } from "../src/editor/highlighter.js";

const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function highlightTsazor(code: string): string {
  const state = startState();
  let html = "";
  for (const line of code.split("\n")) {
    const stream = new StringStream(line, 4, 4);
    if (line.length === 0) {
      html += "\n";
      continue;
    }
    while (!stream.eol()) {
      const style = token(stream as never, state);
      const text = escape(stream.current());
      const classes = style ? classForToken(style) : null;
      html += classes ? `<span class="${classes}">${text}</span>` : text;
      stream.start = stream.pos;
    }
    html += "\n";
  }
  return html.replace(/\n$/, "");
}

function highlightLezer(code: string, language: typeof typescriptLanguage): string {
  let html = "";
  highlightCode(
    code,
    language.parser.parse(code),
    tutorialHighlighter,
    (text, classes) => {
      html += classes ? `<span class="${classes}">${escape(text)}</span>` : escape(text);
    },
    () => {
      html += "\n";
    },
  );
  return html;
}

/** Highlighted HTML for one fenced code block (`lang` = the fence info). */
export function highlight(code: string, lang: string): string {
  switch (lang) {
    case "tsazor":
    case "razor":
    case "html":
      return highlightTsazor(code);
    case "ts":
    case "typescript":
    case "js":
      return highlightLezer(code, typescriptLanguage);
    case "css":
      return highlightLezer(code, cssLanguage as unknown as typeof typescriptLanguage);
    default:
      return escape(code);
  }
}

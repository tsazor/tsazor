/**
 * The CodeMirror 6 editor behind CodeEditor.tsazor: one view, one cached
 * EditorState per file (switching tabs keeps undo history and selection),
 * a language per file type and compiler diagnostics as lint markers.
 */
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, indentOnInput, indentUnit, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import type { Diagnostic } from "../engine/types.js";
import { tutorialHighlighter } from "./highlighter.js";
import { tsazorStreamParser } from "./tsazor-mode.js";

const tsazorLanguage = StreamLanguage.define(tsazorStreamParser);

function languageFor(file: string): Extension {
  if (file.endsWith(".css")) return css();
  if (file.endsWith(".ts")) return javascript({ typescript: true });
  return tsazorLanguage;
}

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "var(--editor-bg)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
  ".cm-gutters": { backgroundColor: "var(--editor-bg)", border: "none", color: "var(--fg-faint)" },
  ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
  ".cm-content": { caretColor: "var(--accent)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused": { outline: "none" },
});

export interface EditorCallbacks {
  /** The user edited `file`. */
  onChange(file: string, text: string): void;
}

export class TutorialEditor {
  private readonly view: EditorView;
  private readonly states = new Map<string, EditorState>();
  private diagnostics: readonly Diagnostic[] = [];
  private active = "";
  private silent = false;

  constructor(parent: HTMLElement, private readonly callbacks: EditorCallbacks) {
    this.view = new EditorView({ parent, state: EditorState.create({ doc: "" }) });
  }

  private extensions(file: string): Extension[] {
    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ activateOnTyping: false }),
      highlightActiveLine(),
      highlightSelectionMatches(),
      indentUnit.of("    "),
      EditorState.tabSize.of(4),
      keymap.of([indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap]),
      languageFor(file),
      syntaxHighlighting(tutorialHighlighter),
      lintGutter(),
      theme,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || this.silent) return;
        this.callbacks.onChange(file, update.state.doc.toString());
      }),
    ];
  }

  /** Replaces all files (lesson change, Solve, Reset) and opens `active`. */
  load(files: Readonly<Record<string, string>>, active: string): void {
    this.states.clear();
    for (const [file, text] of Object.entries(files)) {
      this.states.set(file, EditorState.create({ doc: text, extensions: this.extensions(file) }));
    }
    this.active = "";
    this.open(active in files ? active : Object.keys(files)[0] ?? "");
  }

  /** Switches the visible file. */
  open(file: string): void {
    if (file === this.active) return;
    if (this.active) this.states.set(this.active, this.view.state);
    const state = this.states.get(file);
    if (!state) return;
    this.active = file;
    this.silent = true;
    this.view.setState(state);
    this.silent = false;
    this.applyDiagnostics();
  }

  /** Shows the compiler diagnostics (all files; the visible file's are marked). */
  setDiagnostics(diagnostics: readonly Diagnostic[]): void {
    this.diagnostics = diagnostics;
    this.applyDiagnostics();
  }

  /** Moves the cursor to a position (1-based line, 0-based column) and focuses. */
  reveal(file: string, line: number, column: number): void {
    this.open(file);
    const doc = this.view.state.doc;
    const lineInfo = doc.line(Math.min(Math.max(line, 1), doc.lines));
    const pos = Math.min(lineInfo.from + column, lineInfo.to);
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    this.view.focus();
  }

  private applyDiagnostics(): void {
    const doc = this.view.state.doc;
    const offset = (line: number, column: number): number => {
      const info = doc.line(Math.min(Math.max(line, 1), doc.lines));
      return Math.min(info.from + Math.max(column, 0), info.to);
    };
    const marks: LintDiagnostic[] = this.diagnostics
      .filter((d) => d.file === this.active)
      .map((d) => {
        const from = offset(d.line, d.column);
        let to = offset(d.endLine, d.endColumn);
        if (to <= from) to = Math.min(from + 1, doc.length);
        return { from, to, severity: d.severity, message: `${d.code}: ${d.message}`, source: d.source === "types" ? "tsazor check" : "tsazor" };
      });
    this.view.dispatch(setDiagnostics(this.view.state, marks));
  }

  destroy(): void {
    this.view.destroy();
  }
}

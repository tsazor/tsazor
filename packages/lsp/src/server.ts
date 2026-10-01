import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
  type InitializeParams,
  type InitializeResult,
  type DefinitionParams,
  type CompletionParams,
  type CompletionItem,
  type CompletionList,
  type Hover,
  type HoverParams,
  type Position,
  Location,
  CompletionItemKind,
  type MarkupContent,
  type CodeAction,
  type CodeActionParams,
  CodeActionKind,
  DidChangeWatchedFilesNotification,
  FileChangeType,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { analyzeSource, definitionAt, hoverAt, lspRange, quickFixesAt, type AnalyzedFile } from "./analysis.js";
import { completeAt, type CompletionKind } from "./completions.js";
import { ProjectRegistry } from "./projects.js";
import type { ShadowEntry } from "./ts-service.js";
import {
  tsCompletionDetail,
  tsCompletions,
  tsDefinition,
  tsDiagnostics,
  tsHover,
} from "./ts-features.js";

/** Pure candidates → LSP items. */
const COMPLETION_KINDS: Record<CompletionKind, CompletionItemKind> = {
  component: CompletionItemKind.Class,
  attribute: CompletionItemKind.Property,
  directive: CompletionItemKind.Keyword,
  member: CompletionItemKind.Value,
  slot: CompletionItemKind.Interface,
};

const DIAGNOSTICS_CAP = 200;
const PUBLISH_DEBOUNCE_MS = 100;

/**
 * Tsazor language server (stdio).
 *
 * v2: per-project `ts.LanguageService`s over shadow modules power @code,
 * @{…} and @-expression completions, hover, go-to-definition and (toggleable)
 * semantic diagnostics. Markup contexts keep the v1 heuristics; every query
 * falls back to v1 wherever the shadow layer has nothing to offer.
 *
 * 2.5 projektweit: multiple workspace folders, each file routed to the
 * project of its nearest tsconfig.json (per-app options), tsconfig/
 * didChangeWatchedFiles handling, dependent documents re-checked when a
 * dependency changes.
 */

const connection = createConnection(ProposedFeatures.all);
// v9 API: the document class doubles as the create/update configuration.
const documents = new TextDocuments(TextDocument);

let registry!: ProjectRegistry;
let tsDiagnosticsEnabled = true;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Multi-root: one registry over every workspace folder; each file routes to
  // the tsconfig project nearest above it (per-app options).
  const roots = (params.workspaceFolders ?? []).length > 0
    ? params.workspaceFolders!.map((folder) => fileURLToPath(folder.uri))
    : [process.cwd()];
  registry = new ProjectRegistry(roots);
  // T4 (2.4): the shadow graph covers every project .tsazor, not only open
  // documents — types flow across closed files too. Scanned in the
  // background; the per-document rebuilds keep the open ones fresh.
  void registry.scanAll().then(
    (count) => connection.console.log(`tsazor: ${count} project .tsazor shadowed`),
    (error) => connection.console.error(`tsazor scan failed: ${error instanceof Error ? error.stack : String(error)}`),
  );
  // tsDiagnostics toggle; initializationOptions.tsDiagnostics: false → off.
  const init = (params.initializationOptions ?? {}) as { tsDiagnostics?: boolean };
  tsDiagnosticsEnabled = init.tsDiagnostics !== false;

  const cache = new Map<string, { version: number; analyzed: AnalyzedFile; entry?: ShadowEntry | null }>();
  const pendingPublish = new Map<string, ReturnType<typeof setTimeout>>();

  const analyzed = async (document: TextDocument): Promise<AnalyzedFile> => {
    const cached = cache.get(document.uri);
    if (cached && cached.version === document.version) return cached.analyzed;
    const result = await analyzeSource(uriToPath(document.uri), document.getText(), registry.rootOf(uriToPath(document.uri)));
    cache.set(document.uri, { version: document.version, analyzed: result, entry: cached?.entry });
    return result;
  };

  /** The shadow entry for an open document (rebuilds when the version moved). */
  const entryFor = (document: TextDocument): Promise<ShadowEntry | null> =>
    registry.ensureTsazor(uriToPath(document.uri), document.getText());

  /* Diagnostics publish (compiler + mapped TS, debounced) ----------------- */

  const publish = (document: TextDocument): void => {
    const prior = pendingPublish.get(document.uri);
    if (prior) clearTimeout(prior);
    const timer = setTimeout(() => {
      pendingPublish.delete(document.uri);
      void doPublish(document);
    }, PUBLISH_DEBOUNCE_MS);
    pendingPublish.set(document.uri, timer);
  };

  const doPublish = async (document: TextDocument): Promise<void> => {
    try {
      const { diagnostics } = await analyzed(document);
      const items: Diagnostic[] = diagnostics.map(
        (diagnostic): Diagnostic => ({
          severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          // The construct the diagnostic covers (header, directive, attribute, expression).
          range: lspRange(diagnostic),
          code: diagnostic.code,
          source: "tsazor",
          message: diagnostic.message,
        }),
      );

      if (tsDiagnosticsEnabled) {
        const entry = await entryFor(document);
        if (entry) {
          for (const diag of tsDiagnostics(registry.projectFor(uriToPath(document.uri)).service, entry)) {
            items.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: diag.line, character: diag.character },
                end: { line: diag.endLine, character: diag.endCharacter },
              },
              code: diag.code,
              source: "tsazor-ts",
              message: diag.message,
            });
          }
        }
      }

      connection.sendDiagnostics({ uri: document.uri, diagnostics: dedupeAndCap(items) });
    } catch (error) {
      connection.console.error(`tsazor publish failed: ${error instanceof Error ? error.stack : String(error)}`);
    }
  };

  /** Re-publishing after a dependency changed: the shadow graph and the
   *  component metadata of the dependents moved with it. Cached analyses are
   *  dropped (their diagnostics depend on other files' metadata too). */
  const republishDependents = (changedPath: string): void => {
    for (const dependent of registry.dependentsOf(changedPath)) {
      const document = openDocumentOf(dependent);
      if (!document) continue;
      cache.delete(document.uri);
      publish(document);
    }
  };

  const invalidateShadows = (changedPath: string): void => {
    // An _Imports.tsazor change can alter the component/using chain of every
    // other .tsazor in its subtree — their shadows must be rebuilt. The rebuild
    // happens lazily per request; here we drop the cached versions eagerly.
    if (path.basename(changedPath) !== "_Imports.tsazor") return;
    for (const document of documents.all()) {
      if (path.basename(uriToPath(document.uri)) === "_Imports.tsazor") continue;
      cache.delete(document.uri);
      entryFor(document).catch(() => undefined);
    }
  };

  documents.onDidOpen((event) => publish(event.document));
  documents.onDidChangeContent((event) => {
    const filePath = uriToPath(event.document.uri);
    if (path.basename(filePath) === "_Imports.tsazor") invalidateShadows(filePath);
    publish(event.document);
    // 2.5: once this document's own shadow is rebuilt, the dependent
    // documents get re-checked (their TypeScript layer and component
    // metadata moved with the change).
    void entryFor(event.document)
      .then(() => republishDependents(filePath))
      .catch(() => undefined);
  });
  documents.onDidClose((event) => {
    cache.delete(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
    // Closed files keep their disk shadow (T4): rebuilt by mtime instead of
    // dropped, so closed-file types stay in the shadow graph.
    void registry.ensureTsazor(uriToPath(event.document.uri));
  });

  // File change notifications: created/changed .tsazor files refresh their
  // disk shadow and re-check their dependents, deleted ones leave the shadow
  // graph. A tsconfig change rebuilds the project it owns (its compiler
  // options and library resolution moved).
  connection.onDidChangeWatchedFiles((params) => {
    for (const change of params.changes) {
      const filePath = uriToPath(change.uri);
      if (path.basename(filePath) === "tsconfig.json") {
        registry.projectChanged(filePath);
        for (const document of documents.all()) {
          cache.delete(document.uri);
          publish(document);
        }
        continue;
      }
      if (!filePath.endsWith(".tsazor")) continue;
      if (change.type === FileChangeType.Deleted) {
        registry.closeTsazor(filePath);
        republishDependents(filePath);
      } else {
        void registry
          .ensureTsazor(filePath)
          .then(() => republishDependents(filePath))
          .catch(() => undefined);
      }
    }
  });

  /* Hover: shadow positions → TS layer, everything else → v1 --------------- */

  connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const pos = params.position;
    const entry = await entryFor(document);
    if (entry) {
      const info = tsHover(registry.projectFor(uriToPath(document.uri)).service, entry, pos.line, pos.character);
      if (info) return { contents: { kind: "markdown", value: info.markdown } };
    }
    const current = await analyzed(document);
    const info = hoverAt(current, pos.line, pos.character);
    if (!info) return null;
    const contents: MarkupContent = { kind: "markdown", value: info.markdown };
    return { contents };
  });

  /* Definition: shadow targets map onto .tsazor, real files go verbatim ----- */

  connection.onDefinition(async (params: DefinitionParams): Promise<Location[] | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const pos = params.position;
    const entry = await entryFor(document);
    if (entry) {
      const targets = tsDefinition(registry.projectFor(uriToPath(document.uri)).service, entry, pos.line, pos.character);
      if (targets && targets.length > 0) {
        return targets.map((target) =>
          Location.create(
            pathToFileURL(target.file).toString(),
            {
              start: { line: target.line, character: target.character },
              end: { line: target.endLine, character: target.endCharacter },
            },
          ),
        );
      }
    }
    const current = await analyzed(document);
    const target = definitionAt(current, pos.line, pos.character);
    if (!target) return null;
    return [Location.create(pathToFileURL(target.file).toString(), {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    })];
  });

  /* Completion: code context → TS layer, markup → v1 (slots → metadata) ----- */

  connection.onCompletion(async (params: CompletionParams): Promise<CompletionList> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { isIncomplete: false, items: [] };
    const pos: Position = params.position;
    const entry = await entryFor(document);
    const current = await analyzed(document);

    if (entry) {
      // tsCompletions does the routing internally: markup positions without an
      // `@`-prefix and line-start directive contexts return null → v1. (The
      // gate must not pre-classify on classifyCodeContext — the cursor right
      // behind `@ticker.` sits in a text node there, yet owns TS completions.)
      const candidates = await tsCompletions(
        registry.projectFor(uriToPath(document.uri)).service,
        entry,
        current,
        pos.line,
        pos.character,
      );
      if (candidates !== null) {
        return {
          isIncomplete: false,
          items: candidates.map((candidate): CompletionItem => {
            const item: CompletionItem = {
              label: candidate.label,
              kind: COMPLETION_KINDS.member,
              insertText: candidate.insert ?? candidate.label,
              data: { uri: document.uri, line: pos.line, character: pos.character },
            };
            if (candidate.insert) item.insertTextFormat = 1; // PlainText
            return item;
          }),
        };
      }
    }

    const candidates = completeAt(current, pos.line, pos.character);
    return {
      isIncomplete: false,
      items: candidates.map((candidate): CompletionItem => {
        const item: CompletionItem = {
          label: candidate.label,
          kind: COMPLETION_KINDS[candidate.kind],
          detail: candidate.detail,
          documentation: candidate.doc ? { kind: "markdown", value: candidate.doc } : undefined,
        };
        if (candidate.snippet) {
          item.insertText = candidate.snippet;
          item.insertTextFormat = 2; // Snippet
        }
        return item;
      }),
    };
  });

  /* Completion resolve: only shadow-layer items carry a data marker; they get
     their display parts + documentation from the TS engine's entry details. */
  connection.onCompletionResolve(async (item: CompletionItem): Promise<CompletionItem> => {
    const data = item.data as { uri?: string; line?: number; character?: number } | undefined;
    if (!data?.uri || data.line === undefined || data.character === undefined) return item;
    const document = documents.get(data.uri);
    if (!document) return item;
    const entry = await entryFor(document);
    if (!entry) return item;
    const gen = entry.shadow.map.srcToGen(data.line, data.character);
    if (!gen) return item;
    const details = tsCompletionDetail(registry.projectFor(uriToPath(data.uri)).service, entry, gen.line, gen.column, item.label);
    if (details?.detail) item.detail = details.detail;
    if (details?.doc) item.documentation = { kind: "markdown", value: details.doc };
    return item;
  });

  /* Code actions: the mechanical fixes the compiler attaches (TZS021, TZS022, …) */

  connection.onCodeAction(async (params: CodeActionParams): Promise<CodeAction[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const current = await analyzed(document);
    return quickFixesAt(current, params.range).map((fix): CodeAction => ({
      title: fix.title,
      kind: CodeActionKind.QuickFix,
      isPreferred: true,
      diagnostics: params.context.diagnostics.filter((d) => d.code === fix.diagnostic.code && d.message === fix.diagnostic.message),
      edit: { changes: { [document.uri]: fix.edits } },
    }));
  });

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
      completionProvider: { triggerCharacters: ["<", "@", " ", "."], resolveProvider: true },
    },
  };

  // Watched files need dynamic registration (the LSP static capability is
  // client-side only). Handlers installed above.
  connection.onInitialized(() => {
    void connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [{ globPattern: "**/*.tsazor" }, { globPattern: "**/tsconfig.json" }],
    });
  });
});

documents.listen(connection);
connection.listen();

/* Helpers ------------------------------------------------------------------- */

function uriToPath(uri: string): string {
  return fileURLToPath(uri);
}

/** The open TextDocument behind a real-path dependent, if any. */
function openDocumentOf(filePath: string): TextDocument | undefined {
  const target = filePath.replace(/\\/g, "/").toLowerCase();
  return documents.all().find((document) => uriToPath(document.uri).replace(/\\/g, "/").toLowerCase() === target);
}

/** Dedupe (source+position+message), sort by position, cap the count. */
function dedupeAndCap(items: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const diag of items) {
    const start = diag.range.start;
    const key = `${diag.source}:${start.line}:${start.character}:${diag.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diag);
  }
  out.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
  return items.length <= DIAGNOSTICS_CAP ? out : out.slice(0, DIAGNOSTICS_CAP);
}
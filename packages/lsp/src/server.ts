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
import { TsazorTypeService, type ShadowEntry } from "./ts-service.js";
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
};

const DIAGNOSTICS_CAP = 200;
const PUBLISH_DEBOUNCE_MS = 100;

/**
 * Tsazor language server (stdio).
 *
 * v2: a single per-workspace `ts.LanguageService` over shadow modules powers
 * @code, @{…} and @-expression completions, hover, go-to-definition and
 * (toggleable) semantic diagnostics. Markup contexts keep the v1 heuristics;
 * every query falls back to v1 wherever the shadow layer has nothing to offer.
 */

const connection = createConnection(ProposedFeatures.all);
// v9 API: the document class doubles as the create/update configuration.
const documents = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const root = projectRootOf(params);
  const typeService = new TsazorTypeService(root);
  // T4 (2.4): the shadow graph covers every project .tsazor, not only open
  // documents — types flow across closed files too. Scanned in the
  // background; the per-document rebuilds keep the open ones fresh.
  void typeService.scanProject().then(
    (count) => connection.console.log(`tsazor: ${count} project .tsazor shadowed`),
    (error) => connection.console.error(`tsazor scan failed: ${error instanceof Error ? error.stack : String(error)}`),
  );
  // tsDiagnostics toggle; initializationOptions.tsDiagnostics: false → off.
  const init = (params.initializationOptions ?? {}) as { tsDiagnostics?: boolean };
  const tsDiagnosticsEnabled = init.tsDiagnostics !== false;

  const cache = new Map<string, { version: number; analyzed: AnalyzedFile; entry?: ShadowEntry | null }>();
  const pendingPublish = new Map<string, ReturnType<typeof setTimeout>>();

  const analyzed = async (document: TextDocument): Promise<AnalyzedFile> => {
    const cached = cache.get(document.uri);
    if (cached && cached.version === document.version) return cached.analyzed;
    const result = await analyzeSource(uriToPath(document.uri), document.getText(), root);
    cache.set(document.uri, { version: document.version, analyzed: result, entry: cached?.entry });
    return result;
  };

  /** The shadow entry for an open document (rebuilds when the version moved). */
  const entryFor = (document: TextDocument): Promise<ShadowEntry | null> =>
    typeService.ensureTsazor(uriToPath(document.uri), document.getText());

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
          for (const diag of tsDiagnostics(typeService, entry)) {
            items.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: diag.line, character: diag.character },
                end: { line: diag.line, character: diag.character + 1 },
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

  /* _Imports.tsazor invalidation ------------------------------------------- */

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
    publish(event.document);
    invalidateShadows(uriToPath(event.document.uri));
  });
  documents.onDidClose((event) => {
    cache.delete(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
    // Closed files keep their disk shadow (T4): rebuilt by mtime instead of
    // dropped, so closed-file types stay in the shadow graph.
    void typeService.ensureTsazor(uriToPath(event.document.uri));
  });

  // File change notifications: created/changed .tsazor files refresh their
  // disk shadow (mtime cache), deleted ones leave the shadow graph.
  connection.onDidChangeWatchedFiles((params) => {
    for (const change of params.changes) {
      const filePath = uriToPath(change.uri);
      if (!filePath.endsWith(".tsazor")) continue;
      if (change.type === FileChangeType.Deleted) typeService.closeTsazor(filePath);
      else void typeService.ensureTsazor(filePath).catch(() => undefined);
      invalidateShadows(filePath);
    }
  });

  /* Hover: shadow positions → TS layer, everything else → v1 --------------- */

  connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const pos = params.position;
    const entry = await entryFor(document);
    if (entry) {
      const info = tsHover(typeService, entry, pos.line, pos.character);
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
      const targets = tsDefinition(typeService, entry, pos.line, pos.character);
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

  /* Completion: code context → TS layer, markup → v1 ----------------------- */

  connection.onCompletion(async (params: CompletionParams): Promise<CompletionList> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { isIncomplete: false, items: [] };
    const pos = params.position;
    const entry = await entryFor(document);
    const current = await analyzed(document);

    if (entry) {
      // tsCompletions does the routing internally: markup positions without an
      // `@`-prefix and line-start directive contexts return null → v1. (The
      // gate must not pre-classify on classifyCodeContext — the cursor right
      // behind `@ticker.` sits in a text node there, yet owns TS completions.)
      const candidates = await tsCompletions(typeService, entry, current, pos.line, pos.character);
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
          documentation: candidate.doc,
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
    const details = tsCompletionDetail(typeService, entry, gen.line, gen.column, item.label);
    if (details?.detail) item.detail = details.detail;
    if (details?.doc) item.documentation = { kind: "markdown", value: details.doc };
    return item;
  });

  /* Code actions: the mechanical fixes the compiler attaches (TZS021, TZS022) */

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

  // Watched .tsazor files need dynamic registration (the LSP static
  // capability is client-side only). Handlers installed above.
  connection.onInitialized(() => {
    void connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [{ globPattern: "**/*.tsazor" }],
    });
  });
});

documents.listen(connection);
connection.listen();

/* Helpers ------------------------------------------------------------------- */

function projectRootOf(params: InitializeParams): string {
  const folder = params.workspaceFolders?.[0];
  if (folder) return fileURLToPath(folder.uri);
  return process.cwd();
}

function uriToPath(uri: string): string {
  return fileURLToPath(uri);
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
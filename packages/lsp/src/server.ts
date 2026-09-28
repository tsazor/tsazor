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
  type Hover,
  type HoverParams,
  Location,
  type MarkupContent,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileURL, fileURLToPath } from "node:url";
import { analyzeSource, definitionAt, hoverAt, type AnalyzedFile } from "./analysis";

/**
 * Tasor language server (stdio). Publishes compiler diagnostics as you type
 * and offers hover + go-to-definition for component tags and @inject types.
 */

const connection = createConnection(ProposedFeatures.all);
// v9 API: the document class doubles as the create/update configuration.
const documents = new TextDocuments(TextDocument);
connection.onInitialize((params: InitializeParams): InitializeResult => {
  const root = projectRootOf(params);
  const cache = new Map<string, { version: number; analyzed: AnalyzedFile }>();

  const analyzed = async (document: TextDocument): Promise<AnalyzedFile> => {
    const cached = cache.get(document.uri);
    if (cached && cached.version === document.version) return cached.analyzed;
    const result = await analyzeSource(uriToPath(document.uri), document.getText(), root);
    cache.set(document.uri, { version: document.version, analyzed: result });
    return result;
  };

  const publish = async (document: TextDocument): Promise<void> => {
    try {
      const { diagnostics } = await analyzed(document);
      connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: diagnostics.map(
          (diagnostic): Diagnostic => ({
            severity: diagnostic.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
            range: {
              start: { line: diagnostic.pos.line - 1, character: diagnostic.pos.column },
              end: { line: diagnostic.pos.line - 1, character: diagnostic.pos.column + 1 },
            },
            code: diagnostic.code,
            source: "tasor",
            message: diagnostic.message,
          }),
        ),
      });
    } catch (error) {
      connection.console.error(`tasor publish failed: ${error instanceof Error ? error.stack : String(error)}`);
    }
  };

  documents.onDidOpen((event) => void publish(event.document));
  documents.onDidChangeContent((event) => void publish(event.document));
  documents.onDidClose((event) => {
    cache.delete(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });

  connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const current = await analyzed(document);
    const info = hoverAt(current, params.position.line, params.position.character);
    if (!info) return null;
    const contents: MarkupContent = { kind: "markdown", value: info.markdown };
    return { contents };
  });

  connection.onDefinition(async (params: DefinitionParams): Promise<Location | null> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const current = await analyzed(document);
    const target = definitionAt(current, params.position.line, params.position.character);
    if (!target) return null;
    return Location.create(pathToFileURL(target.file).toString(), {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
  });

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
    },
  };
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
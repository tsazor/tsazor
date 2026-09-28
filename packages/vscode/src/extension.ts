import * as path from "node:path";
import { TransportKind, type LanguageClientOptions, type ServerOptions, LanguageClient, type ExtensionContext } from "vscode-languageclient/node";

/**
 * Tasor extension entry: TextMate highlighting (declarative) + the language
 * client for @tasor/lsp (live diagnostics, hover, go-to-definition).
 */

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio, options: { execArgv: ["--nolazy", "--inspect=6019"] } },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "tazor", scheme: "file" }],
  };

  const client = new LanguageClient("tasorLSP", "Tasor Language Server", serverOptions, clientOptions);
  context.subscriptions.push(client.start());
}
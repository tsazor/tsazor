/**
 * Smoke check for the packaged language server (stdio): initialize → didOpen
 * → completion requests for the four contexts. Run from the repo root:
 *
 *   node packages/vscode/scripts/smoke-completion.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const serverPath = path.join(repoRoot, "packages", "vscode", "dist", "server.js");

const work = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-smoke-"));
await mkdir(path.join(work, "Shared"), { recursive: true });
await mkdir(path.join(work, "Pages"), { recursive: true });
await writeFile(
  path.join(work, "Shared", "Greeter.tsazor"),
  '<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n    @Parameter() NameChanged?: EventCallback<string>;\n    count = 0;\n}\n',
);
await writeFile(path.join(work, "_Imports.tsazor"), "@using ./Shared\n");
await writeFile(path.join(work, "Pages", "Demo.tsazor"), "@page \"/demo\"\n<p>@c</p>\n");
await writeFile(path.join(work, "Pages", "GreeterPage.tsazor"), "@page \"/gp\"\n<Greeter\n    \n/>\n");

const child = spawn(process.execPath, [serverPath, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
let stderr = "";
child.stderr.on("data", (d) => (stderr += d));

// Content-Length framing (vscode-languageserver's JSON-RPC transport).
// Framing is byte-based — keep everything as Buffers until the message is cut.
let nextId = 1;
const pending = new Map();
const buf = { value: Buffer.alloc(0) };
const toFileUri = (p) => "file:///" + p.replace(/\\/g, "/");

const send = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout on ${method}`));
      }
    }, 8000);
  });
const notify = (method, params) => {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params });
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

child.stdout.on("data", (chunk) => {
  buf.value = Buffer.concat([buf.value, chunk]);
  for (;;) {
    const headerEnd = buf.value.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const headers = buf.value.slice(0, headerEnd).toString("utf8");
    const length = parseInt(/Content-Length:\s*(\d+)/i.exec(headers)?.[1] ?? "", 10);
    if (!Number.isFinite(length) || buf.value.length < headerEnd + 4 + length) return;
    const content = buf.value.slice(headerEnd + 4, headerEnd + 4 + length);
    buf.value = buf.value.slice(headerEnd + 4 + length);
    let message;
    try {
      message = JSON.parse(content.toString("utf8"));
    } catch (error) {
      console.error("frame parse failed:", error.message, content.toString("utf8").slice(0, 120));
      continue;
    }
    if (message.id) console.log("  <-", message.method ?? "(response)", message.id, message.error ? `error: ${JSON.stringify(message.error)}` : "ok");
    else if (message.method) console.log("  <-", message.method, message.params?.diagnostics?.length ? `(${message.params.diagnostics.length} diagnostics)` : "");
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    }
  }
});

try {
  const init = await send("initialize", {
    processId: process.pid,
    capabilities: {},
    workspaceFolders: [{ uri: toFileUri(work), name: "work" }],
  });
  console.log("initialize:", init.capabilities.completionProvider ? "completionProvider ok" : "MISSING capability");
  notify("initialized", {});

  const uri = toFileUri(path.join(work, "Pages", "Demo.tsazor"));
  notify("textDocument/didOpen", {
    textDocument: { uri, languageId: "tsazor", version: 1, text: "@page \"/demo\"\n<p>@c</p>\n" },
  });

  const ask = async (name, uriAt, position) => {
    const list = await send("textDocument/completion", { textDocument: { uri: uriAt }, position });
    const labels = list.items.map((i) => i.label);
    console.log(`${name}: [${labels.join(", ")}]`);
    return labels;
  };

  const directives = await ask("@ at line start ->", uri, { line: 0, character: 0 });
  const members = await ask("@c in <p>@c ->", uri, { line: 1, character: 5 });
  const greeterUri = toFileUri(path.join(work, "Pages", "GreeterPage.tsazor"));
  notify("textDocument/didOpen", {
    textDocument: { uri: greeterUri, languageId: "tsazor", version: 1, text: "@page \"/gp\"\n<Greeter\n    \n/>\n" },
  });
  const attrs = await ask("attr position inside <Greeter tag ->", greeterUri, { line: 2, character: 4 });

  const ok = directives.includes("page") && directives.includes("inject") && attrs.includes("Name") && attrs.includes("@bind-Name");
  console.log("smoke:", ok ? "PASS" : "FAIL");
  child.kill();
  await rm(work, { recursive: true, force: true });
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error("smoke FAILED:", error.message);
  console.error("server stderr:", stderr || "(none)");
  child.kill();
  await rm(work, { recursive: true, force: true });
  process.exit(1);
}
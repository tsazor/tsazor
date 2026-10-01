/**
 * Smoke check for the v2 TypeScript engine in the packaged language server
 * (stdio): initialize → didOpen → completion behind `@this.ticker.` (the
 * trailing-dot variant path), hover as PricePoint[], go-to-definition into a
 * real .ts with a mapped range, and a mapped TS2322 diagnostic publish. Run
 * from the repo root:
 *
 *   node packages/vscode/scripts/smoke-ts.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const serverPath = process.env.TSAZOR_SMOKE_SERVER ?? path.join(repoRoot, "packages", "vscode", "dist", "server.js");

const work = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-smoke-ts-"));
await mkdir(path.join(work, "Pages"), { recursive: true });
// Minimal runtime stub with a typed ComponentBase — the inheritance gap v2
// exists for (v1 could never see sidecar members).
const rt = path.join(work, "node_modules", "@tsazor", "runtime");
await mkdir(rt, { recursive: true });
await writeFile(
  path.join(rt, "package.json"),
  JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }),
);
await writeFile(
  path.join(rt, "index.d.ts"),
  "export declare interface RenderTreeBuilder { openElement(seq: number, tag: string): void; closeElement(): void; addAttribute(seq: number, name: string, value?: unknown): void; addContent(seq: number, value: unknown): void; }\n" +
    "export declare class ComponentBase { protected buildRenderTree(b: RenderTreeBuilder): void {} }\n" +
    "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;\n",
);
await writeFile(
  path.join(work, "Pages", "Ticker.tsazor.ts"),
  'import { ComponentBase } from "@tsazor/runtime";\nimport { TickerStore } from "./TickerStore";\n\nexport default class TickerBase extends ComponentBase {\n    ticker = new TickerStore();\n}\n',
);
await writeFile(
  path.join(work, "Pages", "TickerStore.ts"),
  "export interface PricePoint { price: number; time: number; }\n\nexport class TickerStore {\n    count = 0;\n    price = 0;\n    priceText = \"$0\";\n    lastError: string | null = null;\n    points: PricePoint[] = [];\n}\n",
);
const tickerSource =
  '<p>@ticker.points.length</p>\n\n@code {\n    priceText = "";\n}\n';
await writeFile(path.join(work, "Pages", "Ticker.tsazor"), tickerSource);
// The chain doc gets its own code-behind sidecar — like any real page, the
// member `ticker` comes from it (that inheritance is exactly what v2 covers).
await writeFile(
  path.join(work, "Pages", "Chain.tsazor.ts"),
  'import { ComponentBase } from "@tsazor/runtime";\nimport { TickerStore } from "./TickerStore";\n\nexport default class ChainBase extends ComponentBase {\n    ticker = new TickerStore();\n}\n',
);
const chainSource = "<p>@this.ticker.</p>\n";
await writeFile(path.join(work, "Pages", "Chain.tsazor"), chainSource);
const badSource = '<p>@ticker.points.length</p>\n\n@code {\n    priceText: string = 42;\n}\n';
await writeFile(path.join(work, "Pages", "Bad.tsazor"), badSource);

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
    }, 15000);
  });
const notify = (method, params) => {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params });
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

const publishes = [];
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
    if (message.method === "textDocument/publishDiagnostics" && message.params.uri?.endsWith("Bad.tsazor")) {
      publishes.push(message.params);
    }
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    }
  }
});

try {
  await send("initialize", {
    processId: process.pid,
    capabilities: {},
    workspaceFolders: [{ uri: toFileUri(work), name: "work" }],
  });
  notify("initialized", {});

  const open = (name, text) => {
    const uri = toFileUri(path.join(work, "Pages", name));
    notify("textDocument/didOpen", { textDocument: { uri, languageId: "tsazor", version: 1, text } });
    return uri;
  };
  const tickerUri = open("Ticker.tsazor", tickerSource);
  const chainUri = open("Chain.tsazor", chainSource);
  open("Bad.tsazor", badSource);

  // 1) Completion behind the trailing dot: `<p>@this.ticker.|</p>` — col 16.
  const list = await send("textDocument/completion", {
    textDocument: { uri: chainUri },
    position: { line: 0, character: 16 },
  });
  const labels = list.items.map((i) => i.label);
  const completionOk = labels.includes("points") && labels.includes("count");
  console.log("completion after `@this.ticker.`:", labels.filter((l) => ["count", "points", "priceText", "lastError"].includes(l)).join(","));
  console.log("  -> completion:", completionOk ? "ok" : "FAIL");

  // 2) Hover on `points` in `<p>@ticker.points.length</p>` on line 0
  //    (`ticker` = 4..9, `points` = 11..16 → col 12).
  const hover = await send("textDocument/hover", {
    textDocument: { uri: tickerUri },
    position: { line: 0, character: 12 },
  });
  const hoverText = JSON.stringify(hover?.contents ?? "");
  const hoverOk = hoverText.includes("PricePoint[]");
  console.log("hover on `points`:", hoverText.replace(/\n/g, " ").slice(0, 90));
  console.log("  -> hover:", hoverOk ? "ok" : "FAIL");

  // 3) Definition: `points` lands in the real TickerStore.ts, mapped onto the
  //    field declaration (0-based line 7: interface, blank, class, count,
  //    price, priceText, lastError, points).
  const defs = (await send("textDocument/definition", {
    textDocument: { uri: tickerUri },
    position: { line: 0, character: 12 },
  })) ?? [];
  const storeDef = defs.find((d) => d.uri.endsWith("TickerStore.ts"));
  const defOk = Boolean(storeDef) && storeDef.range.start.line === 7;
  console.log(
    "definition on `points`:",
    defs.map((d) => path.basename(decodeURIComponent(d.uri)) + ":" + d.range.start.line).join(", ") || "(none)",
  );
  console.log("  -> definition:", defOk ? "ok" : "FAIL");

  // 4) Mapped TS2322 diagnostic on the Bad.tsazor @code line (debounced).
  await new Promise((r) => setTimeout(r, 1500));
  const last = publishes[publishes.length - 1];
  const tsDiag = (last?.diagnostics ?? []).find(
    (d) => d.source === "tsazor-ts" && d.code === 2322,
  );
  const diagOk = Boolean(tsDiag) && tsDiag.range.start.line === 3 && /string|number/.test(tsDiag.message);
  console.log(
    "diagnostics Bad.tsazor:",
    (last?.diagnostics ?? []).map((d) => `${d.source ?? "?"}:${d.code ?? "?"}@${d.range.start.line}`).join(", ") || "(none)",
  );
  console.log("  -> diagnostics:", diagOk ? "ok" : "FAIL");

  const ok = completionOk && hoverOk && defOk && diagOk;
  console.log("smoke-ts:", ok ? "PASS" : "FAIL");
  child.kill();
  await rm(work, { recursive: true, force: true });
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error("smoke-ts FAILED:", error.message);
  console.error("server stderr:", stderr || "(none)");
  child.kill();
  await rm(work, { recursive: true, force: true });
  process.exit(1);
}
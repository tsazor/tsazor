/**
 * S3 — never block development: a TypeScript type error never fails a
 * module in the dev server (the transform does not type-check); with
 * `check: true` the dev server reports the findings in the background and
 * re-checks after changes; the build still fails on them.
 */
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CheckDiagnostic } from "@tsazor/lsp";
import { tsazor } from "../src";
import { startDevCheck } from "../src/dev-check";

/** `count` is a number; `.toUpperCase()` on it is a type error (TS2339), not a compile error. */
const TYPE_ERROR = `<p>@count.toUpperCase()</p>\n\n@code {\n    count = 1;\n}\n`;

let root = "";
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-never-block-"));
  await mkdir(path.join(root, "Pages"), { recursive: true });
  await writeFile(path.join(root, "Pages", "Broken.tsazor"), TYPE_ERROR);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const finding = (code: string): CheckDiagnostic =>
  ({ file: path.join(root, "Pages", "Broken.tsazor"), line: 1, column: 5, code, message: "m", severity: "error" }) as CheckDiagnostic;

describe("never block development (S3)", () => {
  it("a type error does not fail the dev transform: the module compiles and serves", async () => {
    const plugin = tsazor({ root, check: true });
    (plugin.configResolved as unknown as (config: { root: string }) => void)({ root });
    const result = await plugin.transform?.call({} as never, TYPE_ERROR, path.join(root, "Pages", "Broken.tsazor"));
    expect(result).not.toBeNull();
    expect((result as { code: string }).code).toContain("toUpperCase");
  });

  it("the dev check reports in the background at start and re-checks after a change (debounced, one run at a time)", async () => {
    const watcher = new EventEmitter();
    const lines: string[] = [];
    let runs = 0;
    const check = startDevCheck(watcher, {
      root,
      delay: 10,
      log: (line) => lines.push(line),
      run: async (_root, log) => {
        runs++;
        log(`run ${runs}: Broken.tsazor(1,5) TS2339`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [finding("TS2339")];
      },
    });
    await check.idle();
    expect(runs).toBe(1);
    // Three quick saves and an unrelated file: one more run.
    watcher.emit("change", path.join(root, "Pages", "Broken.tsazor"));
    watcher.emit("change", path.join(root, "Pages", "Broken.tsazor"));
    watcher.emit("change", path.join(root, "Pages", "Other.ts"));
    watcher.emit("change", path.join(root, "styles.css"));
    await check.idle();
    expect(runs).toBe(2);
    expect(lines).toEqual(["run 1: Broken.tsazor(1,5) TS2339", "run 2: Broken.tsazor(1,5) TS2339"]);
    check.stop();
    watcher.emit("change", path.join(root, "Pages", "Broken.tsazor"));
    await check.idle();
    expect(runs).toBe(2);
  });

  it("the real check finds the type error the transform let through", async () => {
    const watcher = new EventEmitter();
    const lines: string[] = [];
    const check = startDevCheck(watcher, { root, log: (line) => lines.push(line) });
    await check.idle();
    check.stop();
    expect(lines.some((line) => line.startsWith("Pages/Broken.tsazor(1,") && line.includes("TS2339"))).toBe(true);
    expect(lines.at(-1)).toMatch(/^tsazor check: 1 file\(s\), [1-9]\d* error\(s\)/);
  });

  it("a failing check run is reported, not thrown", async () => {
    const watcher = new EventEmitter();
    const lines: string[] = [];
    const check = startDevCheck(watcher, {
      root,
      log: (line) => lines.push(line),
      run: () => Promise.reject(new Error("tsconfig unreadable")),
    });
    await check.idle();
    check.stop();
    expect(lines).toEqual(["check failed: tsconfig unreadable"]);
  });
});

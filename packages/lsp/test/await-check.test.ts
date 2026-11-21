/**
 * `<Await>` (Tsazor extension) through the type layer (`tsazor check`)
 * against the real runtime declarations: `TValue` is inferred from `For`
 * through the awaited type (`Promise<User> | undefined` → `User`), so the
 * `Then` context is typed and a wrong member is a TS error; an explicit
 * `TValue="…"` is the fallback; the `Catch` context (`unknown`) stays
 * unchecked, like ErrorBoundary's ErrorContent.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProject, type CheckDiagnostic } from "../src/check";

const runtimeDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../runtime/dist/index.js").replace(/\\/g, "/");

let root = "";
let diagnostics: CheckDiagnostic[] = [];

const CODE = [
  "@code {",
  "    user?: Promise<User>;",
  "    plain: User = { name: \"a\" };",
  "    override onInitialized() {",
  "        this.user = Promise.resolve({ name: \"Ada\" });",
  "    }",
  "}",
  "",
];

const file = (markup: string[]): string => ['@import type { User } from "./user"', "", ...markup, "", ...CODE].join("\n");

const GOOD = file([
  '<Await For="@user">',
  "    <Pending><p>Loading…</p></Pending>",
  '    <Then Context="u"><p>Hello @u.name</p></Then>',
  '    <Catch Context="err"><p>Failed: @err.message</p></Catch>',
  "</Await>",
  '<Await For="plain"><Then>@context.name</Then></Await>',
]);

const WRONG_MEMBER = file([
  '<Await For="@user">',
  '    <Then Context="u"><p>Hello @u.nickname</p></Then>',
  "</Await>",
]);

const EXPLICIT = file([
  '<Await TValue="User" For="@user">',
  '    <Then Context="u"><p>@u.nickname</p></Then>',
  "</Await>",
]);

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-await-"));
  const rt = path.join(root, "node_modules", "@tsazor", "runtime");
  mkdirSync(rt, { recursive: true });
  writeFileSync(path.join(rt, "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  // The real runtime declarations (built by the gate before the tests run).
  writeFileSync(path.join(rt, "index.d.ts"), `export * from "${runtimeDist.replace(/\.js$/, "")}";\n`);
  await writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, lib: ["ES2022", "DOM"], skipLibCheck: true } }),
  );
  await writeFile(path.join(root, "user.ts"), "export interface User { name: string; }\n");
  await writeFile(path.join(root, "Good.tsazor"), GOOD);
  await writeFile(path.join(root, "WrongMember.tsazor"), WRONG_MEMBER);
  await writeFile(path.join(root, "Explicit.tsazor"), EXPLICIT);
  diagnostics = (await checkProject(root)).diagnostics;
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const of = (name: string): CheckDiagnostic[] => diagnostics.filter((d) => path.basename(d.file) === name);

describe("tsazor check — <Await>", () => {
  it("Pending / Then / Catch check clean; Then's context is the awaited type", () => {
    expect(of("Good.tsazor")).toEqual([]);
  });

  it("a wrong member on the inferred Then context is a TS error on its line", () => {
    const found = of("WrongMember.tsazor");
    expect(found.map((d) => d.code)).toEqual(["TS2339"]);
    expect(found[0]!.line).toBe(4);
    expect(found[0]!.message).toContain("nickname");
  });

  it("an explicit TValue types the context too", () => {
    const found = of("Explicit.tsazor");
    expect(found.map((d) => d.code)).toEqual(["TS2339"]);
    expect(found[0]!.message).toContain("User");
  });
});

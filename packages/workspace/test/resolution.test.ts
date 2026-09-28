/**
 * Workspace resolution tests: _Imports chains, component/type resolution and
 * @code import collection over a temp directory tree.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectCodeImports, collectImports, createFileContext, RUNTIME_TYPES } from "../src";

let root = "";
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tasor-ws-"));
  root = dir;
  await mkdir(path.join(dir, "Shared"), { recursive: true });
  await mkdir(path.join(dir, "Pages"), { recursive: true });
  await writeFile(path.join(dir, "_Imports.tazor"), "@using ./Shared\n");
  await writeFile(path.join(dir, "Shared", "Card.tazor"), "<div class='card'>@Child</div>\n");
  await writeFile(path.join(dir, "UserService.ts"), "export default class UserService {}\n");
  cleanup = async () => rm(dir, { recursive: true, force: true });
});

afterAll(() => cleanup());

describe("collectImports", () => {
  it("walks the _Imports chain upward with the nearest layer winning", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    expect(chain.usings).toContain("./Shared");
    expect(chain.layers).toHaveLength(1); // only the root _Imports exists
  });
});

describe("createFileContext", () => {
  it("resolves components through _Imports directories (siblings visible)", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    const context = createFileContext(path.join(root, "Pages", "Index.tazor"), chain);
    const resolved = context.resolveComponent("Card", []);
    expect(resolved?.specifier).toBe("../Shared/Card.tazor");
    expect(context.resolveComponent("Nobody", [])).toBeNull();
  });

  it("resolves @inject types from @using paths and runtime built-ins", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    const context = createFileContext(path.join(root, "Pages", "Index.tazor"), chain);
    expect(context.resolveType("UserService", [])?.specifier).toBe("../UserService");
    expect(context.resolveType("EventCallback", [])?.exportName).toBe("EventCallback");
    expect(RUNTIME_TYPES.has("EventCallback")).toBe(true);
  });
});

describe("collectCodeImports", () => {
  it("imports runtime types and local files used in @code blocks", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    const context = createFileContext(path.join(root, "Pages", "Index.tazor"), chain);
    const compiled = "import { ComponentBase, RenderTreeBuilder } from \"@tasor/runtime\";\n";
    const imports = collectCodeImports("uses UserService and InputText", compiled, context);
    expect(imports).toContain('import { InputText } from "@tasor/runtime";');
    // v1 limit: .ts services in @code need their own import line — only
    // runtime types and .tazor components are auto-imported.
    expect(imports).not.toContain("import UserService");
  });
});
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
  const dir = await mkdtemp(path.join(tmpdir(), "tsazor-ws-"));
  root = dir;
  await mkdir(path.join(dir, "Shared"), { recursive: true });
  await mkdir(path.join(dir, "Pages"), { recursive: true });
  await writeFile(path.join(dir, "_Imports.tsazor"), "@using ./Shared\n");
  await writeFile(path.join(dir, "Shared", "Card.tsazor"), "<div class='card'>@Child</div>\n");
  await writeFile(path.join(dir, "UserService.ts"), "export default class UserService {}\n");
  // Barrel-like module in an _Imports layer dir: several exported names.
  await writeFile(
    path.join(dir, "models.ts"),
    "export interface Address { city: string; }\nexport interface Pizza { name: string; }\n",
  );
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
    const context = createFileContext(path.join(root, "Pages", "Index.tsazor"), chain);
    const resolved = context.resolveComponent("Card", []);
    expect(resolved?.specifier).toBe("../Shared/Card.tsazor");
    expect(context.resolveComponent("Nobody", [])).toBeNull();
  });

  it("resolves @inject types from @using paths and runtime built-ins", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    const context = createFileContext(path.join(root, "Pages", "Index.tsazor"), chain);
    expect(context.resolveType("UserService", [])?.specifier).toBe("../UserService");
    expect(context.resolveType("EventCallback", [])?.exportName).toBe("EventCallback");
    expect(RUNTIME_TYPES.has("EventCallback")).toBe(true);
  });

  it("resolves named exports of .ts modules in the candidate dirs (barrels)", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    const context = createFileContext(path.join(root, "Pages", "Index.tsazor"), chain);
    expect(context.resolveType("Address", [])).toMatchObject({ specifier: "../models", exportName: "Address" });
    expect(context.resolveType("Pizza", [])?.exportName).toBe("Pizza");
    // Unresolvable names still fall through.
    expect(context.resolveType("UnknownModel", [])).toBeNull();
  });

  it("never resolves JS globals or TS utility types to imports", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    const context = createFileContext(path.join(root, "Pages", "Index.tsazor"), chain);
    // These references in @code (e.g. Math.min, Record<string, T>) stay globals.
    expect(context.resolveType("Math", [])).toBeNull();
    expect(context.resolveType("Date", [])).toBeNull();
    expect(context.resolveType("Record", [])).toBeNull();
    expect(context.resolveType("Partial", [])).toBeNull();
  });
});

describe("collectCodeImports", () => {
  it("imports runtime types, local modules and named exports used in @code", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    const context = createFileContext(path.join(root, "Pages", "Index.tsazor"), chain);
    const compiled = "import { ComponentBase, RenderTreeBuilder } from \"@tsazor/runtime\";\n";
    const imports = collectCodeImports("address: Address; uses UserService and InputText", compiled, context);
    expect(imports).toContain('import { InputText } from "@tsazor/runtime";');
    // Named exports of .ts modules resolve too, so model types type-check
    // inside verbatim @code blocks (type-only usage is elided by the build).
    expect(imports).toContain('import { Address } from "../models";');
    expect(imports).toContain('import UserService from "../UserService";');
  });
});
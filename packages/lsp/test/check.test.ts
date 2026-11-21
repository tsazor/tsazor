/**
 * 2.4 acceptance measure: `tsazor check` reports the two known
 * RedirectToLogin bugs — (1) the injected field is `Nav`, the code says
 * `this.nav` (TS2339 through the shadow), (2) `buildRenderTree` written into
 * @code duplicates the generated member (TZS020). The fixed port (the file as
 * it exists in the app today) passes.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProject } from "../src/check";

let root = "";

const FIXED = [
  "@inject NavigationManager Nav",
  "",
  "<p class=\"unauthorized-note\">Access denied — redirecting…</p>",
  "",
  "@code {",
  "    /** Self-contained (renders outside layouts — NotAuthorized leaves them): redirects to /login once mounted. */",
  "    protected override onInitialized(): void {",
  "        this.Nav.navigateTo(\"/login\", { replace: true });",
  "    }",
  "}",
  "",
].join("\n");

// Bug 1: the injected field is `Nav`, the @code body says `this.nav`.
const BROKEN_NAV = FIXED.replace("this.Nav.navigateTo", "this.nav.navigateTo");

// Bug 2: buildRenderTree written into @code — the generated member replaces
// the handwritten one silently; the check must report the conflict.
const BROKEN_TREE = [
  "@inject NavigationManager Nav",
  "",
  "<p class=\"unauthorized-note\">Access denied — redirecting…</p>",
  "",
  "@code {",
  "    buildRenderTree() {}",
  "",
  "    protected override onInitialized(): void {",
  "        this.Nav.navigateTo(\"/login\", { replace: true });",
  "    }",
  "}",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-check-"));
  await mkdir(path.join(root, "node_modules", "@tsazor", "runtime"), { recursive: true });
  writeFileSync(
    path.join(root, "node_modules", "@tsazor", "runtime", "package.json"),
    JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }),
  );
  writeFileSync(
    path.join(root, "node_modules", "@tsazor", "runtime", "index.d.ts"),
    [
      "export declare interface RenderTreeBuilder {",
      "  openElement(seq: number, tag: string): void;",
      "  closeElement(): void;",
      "  openComponent(seq: number, componentType: unknown): void;",
      "  closeComponent(): void;",
      "  openRegion(seq: number): void;",
      "  closeRegion(): void;",
      "  addAttribute(seq: number, name: string, value?: unknown): void;",
      "  addContent(seq: number, value: unknown): void;",
      "  addMarkupContent(seq: number, value: string | null): void;",
      "  addElementReferenceCapture(seq: number, action: (element: Element) => void): void;",
      "  addComponentReferenceCapture(seq: number, action: (component: unknown) => void): void;",
      "}",
      "export declare class ComponentBase {",
      "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
      "  protected onInitialized(): void {}",
      "}",
      "export declare type Token<T> = abstract new (...args: never[]) => T;",
      "export declare class NavigationManager {",
      "  navigateTo(uri: string, forceLoadOrOptions?: boolean | { replace?: boolean }, replace?: boolean): void;",
      "}",
      "export declare function inject<T>(token: Token<T>): T;",
      "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;",
      ""
    ].join("\n"),
  );

  await writeFile(path.join(root, "RedirectToLogin.tsazor"), FIXED);
  await writeFile(path.join(root, "RedirectToLogin.broken-nav.tsazor"), BROKEN_NAV);
  await writeFile(path.join(root, "RedirectToLogin.broken-tree.tsazor"), BROKEN_TREE);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — RedirectToLogin acceptance fixture", () => {
  it("the fixed port passes: no diagnostics", async () => {
    const result = await checkProject(path.join(root));
    const findings = result.diagnostics.filter((d) => !d.file.includes(".broken-"));
    expect(findings).toEqual([]);
  });

  it("bug 1 — `this.nav` vs the injected `Nav` is a TS2339/TS2551 on the source line", async () => {
    const result = await checkProject(path.join(root));
    // TS upgrades the 2339 to 2551 with a `Did you mean 'Nav'?` suggestion.
    const nav = result.diagnostics.filter((d) => d.file.includes("broken-nav") && ["TS2339", "TS2551"].includes(d.code));
    expect(nav.length).toBeGreaterThan(0);
    expect(nav[0]?.message).toContain("'nav'");
    expect(nav[0]?.line).toBe(8);
  });

  it("bug 2 — a @code buildRenderTree is TZS020 (duplicates the generated member)", async () => {
    const result = await checkProject(path.join(root));
    const tree = result.diagnostics.filter((d) => d.file.includes("broken-tree") && d.code === "TZS020");
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0]?.line).toBe(6);
  });
});
/**
 * TZS040 (B46): an element's value bind that converts by the bound value's type at run time (a text input, a
 * textarea, a select — K.7/K.8), bound to a number, a Decimal or a date that can be null. Only the type layer knows the
 * declared type, so `tsazor check` reports it from there.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkProject } from "../src/check.js";

describe("tsazor check — a text field bound to a nullable number, Decimal or date (TZS040)", () => {
  it("warns on a text input, a textarea and a select; a typed input, a string and a number that is never null stay quiet", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "tsazor-check-text-bind-"));
    try {
      await writeFile(
        path.join(project, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true, noEmit: true }, include: ["src"] }),
      );
      await mkdir(path.join(project, "src"), { recursive: true });
      await writeFile(
        path.join(project, "src", "Order.tsazor"),
        [
          "<input @bind=\"price\" />",
          "<input type=\"number\" @bind=\"count\" />",
          "<input type=\"date\" @bind=\"when\" />",
          "<input @bind=\"note\" />",
          "<select @bind=\"choice\"><option value=\"1\">One</option></select>",
          "<input @bind=\"total\" />",
          "<textarea @bind=\"due\"></textarea>",
          "",
          "@code {",
          "    private price: number | null = null;",
          "    private count: number | null = null;",
          "    private when: Date | null = null;",
          "    private note: string | null = null;",
          "    private choice: number | undefined;",
          "    private total = 0;",
          "    private due: Date | null = null;",
          "}",
          "",
        ].join("\n"),
      );
      const result = await checkProject(project);
      const warnings = result.diagnostics.filter((d) => d.code === "TZS040");
      expect(warnings.map((d) => [d.line, d.severity])).toEqual([[1, "warning"], [5, "warning"], [7, "warning"]]);
      expect(warnings[0]!.message).toContain("'price' is a number that can be null");
      expect(warnings[0]!.message).toContain('<input type="number">');
      expect(warnings[1]!.message).toContain("Select with items");
      expect(warnings[2]!.message).toContain("'due' is a Date that can be null");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});

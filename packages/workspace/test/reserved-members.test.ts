/**
 * S5: the compiler's list of names reserved by ComponentBase (TZS031) must
 * match the runtime. Every non-private member of ComponentBase's declaration
 * is either reserved or one of the lifecycle hooks a component overrides —
 * a new base member without a decision fails here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { OVERRIDABLE_MEMBERS, RESERVED_MEMBERS } from "@tsazor/compiler";

const here = path.dirname(fileURLToPath(import.meta.url));
const declaration = path.resolve(here, "../../runtime/src/components/component-base.ts");

function componentBaseMembers(): string[] {
  const file = ts.createSourceFile(declaration, readFileSync(declaration, "utf8"), ts.ScriptTarget.Latest, true);
  const cls = file.statements.find((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === "ComponentBase");
  const names = new Set<string>();
  for (const member of cls?.members ?? []) {
    if (ts.isConstructorDeclaration(member) || member.name === undefined || !ts.isIdentifier(member.name)) continue; // #private names are not identifiers
    const isPrivate = ts.canHaveModifiers(member) && (ts.getModifiers(member) ?? []).some((m) => m.kind === ts.SyntaxKind.PrivateKeyword);
    if (!isPrivate) names.add(member.name.text);
  }
  return [...names].sort();
}

describe("names reserved by ComponentBase (TZS031)", () => {
  it("every non-private ComponentBase member is reserved or an overridable hook", () => {
    const members = componentBaseMembers();
    expect(members.length).toBeGreaterThan(10);
    const undecided = members.filter((name) => !RESERVED_MEMBERS.has(name) && !OVERRIDABLE_MEMBERS.has(name));
    expect(undecided, "add each to RESERVED_MEMBERS or OVERRIDABLE_MEMBERS in compiler/src/reserved-members.ts").toEqual([]);
    const stale = [...RESERVED_MEMBERS, ...OVERRIDABLE_MEMBERS].filter((name) => !members.includes(name));
    expect(stale, "names no longer on ComponentBase").toEqual([]);
  });
});

/**
 * Names every component inherits from `ComponentBase` (roadmap S5). Blazor's
 * base members are PascalCase and never meet a component's camelCase fields;
 * Tsazor's camelCase API shares one namespace with them. A `@code` member of
 * the same name replaces the base member — a parameter called `observe`
 * overwrites the method at runtime, and the type check only says TS2416. The
 * compiler reports TZS031 with the reason instead.
 *
 * Kept in sync with the runtime by a test in @tsazor/workspace (which reads
 * ComponentBase's declaration). Not listed: the lifecycle methods a
 * component overrides on purpose (`onInitialized`, `onParametersSet`,
 * `onAfterRender`, `shouldRender`, `setParametersAsync`) and
 * `buildRenderTree` (TZS020).
 */
import * as ts from "typescript";

/** ComponentBase members a component must not redeclare. */
export const RESERVED_MEMBERS: ReadonlySet<string> = new Set([
  // The public API a component calls.
  "stateHasChanged",
  "inject",
  "observe",
  "dispatchExceptionAsync",
  "disposeSignal",
  "renderFragment",
  // The protected hook that writes the parameters (the runtime's own components override it). The renderer's
  // plumbing is private state behind @tsazor/runtime/internal's componentInternals: it takes no name.
  "applyParameterValues",
]);

/**
 * Blazor's lifecycle method names → Tsazor's hook (TZS032). Tsazor has one hook for each step, and
 * the hook may be async; a member under Blazor's name is never called.
 */
export const BLAZOR_LIFECYCLE_NAMES: ReadonlyMap<string, string> = new Map([
  ["onInitializedAsync", "onInitialized"],
  ["OnInitialized", "onInitialized"],
  ["OnInitializedAsync", "onInitialized"],
  ["onParametersSetAsync", "onParametersSet"],
  ["OnParametersSet", "onParametersSet"],
  ["OnParametersSetAsync", "onParametersSet"],
  ["onAfterRenderAsync", "onAfterRender"],
  ["OnAfterRender", "onAfterRender"],
  ["OnAfterRenderAsync", "onAfterRender"],
  ["ShouldRender", "shouldRender"],
  ["SetParametersAsync", "setParametersAsync"],
  ["Dispose", "dispose"],
  ["DisposeAsync", "disposeAsync"],
]);

/** The ComponentBase members a component overrides on purpose (lifecycle hooks). */
export const OVERRIDABLE_MEMBERS: ReadonlySet<string> = new Set([
  "onInitialized",
  "onParametersSet",
  "onAfterRender",
  "shouldRender",
  "setParametersAsync",
  "buildRenderTree",
]);

/** Every named member a `@code` body declares, with the offset of its name in the body. */
export function bodyMemberNames(body: string): { name: string; offset: number }[] {
  const prefix = "class __tsazor_members {\n";
  const file = ts.createSourceFile("members.ts", `${prefix}${body}\n}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = file.statements.find(ts.isClassDeclaration);
  const names: { name: string; offset: number }[] = [];
  for (const member of cls?.members ?? []) {
    if (member.name === undefined || !(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))) continue;
    names.push({ name: member.name.text, offset: member.name.getStart(file) - prefix.length });
  }
  return names;
}

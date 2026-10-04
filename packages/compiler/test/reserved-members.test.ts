/**
 * S5: `@code` members and `@inject` names that would replace a ComponentBase
 * member are TZS031 (instead of the type check's bare TS2416); lifecycle
 * overrides stay allowed.
 */
import { describe, expect, it } from "vitest";
import { compile } from "../src/index";

const diagnose = (source: string) =>
  compile(source, { className: "Demo", generateSourceMap: false }).diagnostics.all.map((d) => ({ code: d.code, line: d.pos.line, column: d.pos.column, message: d.message }));

describe("TZS031 — names reserved by ComponentBase", () => {
  it("a parameter, a field and a method with a ComponentBase name are errors at the name", () => {
    const found = diagnose(`<p>@track</p>\n@code {\n    @Parameter() observe = "";\n    stateHasChanged = 1;\n    inject() {}\n}`);
    expect(found.filter((d) => d.code === "TZS031").map((d) => [d.line, d.column])).toEqual([[3, 17], [4, 4], [5, 4]]);
    expect(found.find((d) => d.code === "TZS031")!.message).toBe(
      "Name reserved by ComponentBase. " +
      "'observe' is already a member of every component (ComponentBase.observe). Declaring a member called 'observe' would replace the inherited one, which the runtime relies on. Choose another name.",
    );
  });

  it("an @inject name is checked too", () => {
    const found = diagnose(`@inject Clock disposeSignal\n<p>x</p>`);
    expect(found.map((d) => d.code)).toContain("TZS031");
    expect(found.find((d) => d.code === "TZS031")!.message).toContain("Declaring an injected service called 'disposeSignal'");
  });

  it("lifecycle overrides and ordinary names are fine", () => {
    const found = diagnose(`<p>@count</p>\n@code {\n    count = 0;\n    track = "ts";\n    override onInitialized() {}\n    override onParametersSet() {}\n    override shouldRender() { return true; }\n    dispose() {}\n}`);
    expect(found.map((d) => d.code)).not.toContain("TZS031");
  });
});

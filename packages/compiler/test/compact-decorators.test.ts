/**
 * Compact field decorators (src/compact-decorators.ts): a class whose every decorator is one of the runtime's
 * registering field decorators keeps plain fields and gets one `decorateFields` call after it; any other decorator
 * leaves the class as it is; every position stays, so a source map of the input stays right.
 */
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { compactFieldDecorators } from "../src/compact-decorators";

const lower = (code: string) => transformSync(code, { loader: "ts", supported: { decorators: false }, tsconfigRaw: { compilerOptions: { target: "es2022" } } }).code;

const badge = `import { ComponentBase, Parameter, Required as Needed, MaxLength } from "@tsazor/runtime";
export default class Badge extends ComponentBase {
  /** The text. */
  @Parameter() text = "";
  @Parameter({
    captureUnmatchedValues: true,
  }) attributes?: Record<string, unknown>;
  @Needed() @MaxLength(80) private name = "";
  get shown() { return this.text; }
}
`;

describe("compactFieldDecorators", () => {
  it("applies a class's registering field decorators after it, in one call, and keeps every line where it was", () => {
    const compact = compactFieldDecorators(badge);
    expect(compact).not.toMatch(/@\w+\(/);
    expect(compact).toContain(
      '} __tsazor_decorateFields(Badge, { text: [Parameter()], attributes: [Parameter({ captureUnmatchedValues: true, })], name: [Needed(), MaxLength(80)] });',
    );
    expect(compact.endsWith('import { decorateFields as __tsazor_decorateFields } from "@tsazor/runtime";\n')).toBe(true);
    // Every line before the class's end is the same length, the decorators blanked: the positions stay.
    const before = badge.split("\n");
    const after = compact.split("\n");
    for (let line = 0; line < before.length - 2; line++) expect(after[line]!.length, `line ${line + 1}`).toBe(before[line]!.length);
    expect(after[3]).toBe("               text = \"\";");
    // Lowered, no decorator is left: esbuild writes none of its helpers.
    expect(lower(compact)).not.toContain("__decorateElement");
  });

  it("leaves a class with any other decorator as it is: a class decorator, an accessor, a decorator of the app's own", () => {
    const cases = [
      `import { Parameter, CascadingTypeParameter } from "@tsazor/runtime";\n@CascadingTypeParameter("T")\nexport class A { @Parameter() x = 1; }\n`,
      `import { Parameter, Bindable } from "@tsazor/runtime";\nexport class B { @Parameter() x = 1; @Bindable() accessor y = 2; }\n`,
      `import { Parameter } from "@tsazor/runtime";\nimport { track } from "./track";\nexport class C { @Parameter() @track() x = 1; }\n`,
      `import { Parameter } from "@tsazor/runtime";\nexport class D { @Parameter() static x = 1; }\n`,
      `import { Parameter } from "@tsazor/runtime";\nexport class E { @Parameter() #x = 1; }\n`,
      `import { Parameter } from "@tsazor/runtime";\nexport class F { @Parameter() ["x"] = 1; }\n`,
      `import { Parameter } from "@tsazor/runtime";\nexport class G { @Parameter({ //\n  captureUnmatchedValues: true }) x = 1; }\n`,
      `import type { Parameter } from "@tsazor/runtime";\nexport class H { @Parameter() x = 1; }\n`,
      `import { Parameter } from "./my-parameter";\nexport class I { @Parameter() x = 1; }\n`,
    ];
    for (const code of cases) expect(compactFieldDecorators(code), code).toBe(code);
  });

  it("compacts each class on its own: one that can, beside one that can't", () => {
    const code = `import { Parameter, Bindable } from "@tsazor/runtime";\nexport class A { @Parameter() x = 1; }\nexport class B { @Bindable() accessor y = 2; }\n`;
    const compact = compactFieldDecorators(code);
    expect(compact).toContain("} __tsazor_decorateFields(A, { x: [Parameter()] });");
    expect(compact).toContain("@Bindable() accessor y = 2;");
    expect(compact).not.toContain("__tsazor_decorateFields(B");
  });

  it("leaves a module with no class to compact as it is", () => {
    const code = `import { inject } from "@tsazor/runtime";\nexport class Service { http = inject(Http); }\n`;
    expect(compactFieldDecorators(code)).toBe(code);
  });
});

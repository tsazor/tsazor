/**
 * `decorateFields` (the compiled form of `@Parameter() x` and the other registering field decorators, the ABI): the
 * decorators applied right after the class give the metadata the language gives while defining it — parameters,
 * query parameters, validation rules in their order, inheritance either way.
 */
import { describe, expect, it } from "vitest";
import { CascadingParameter, ComponentBase, decorateFields, MaxLength, Parameter, Required, SupplyParameterFromQuery, type FieldDecorator } from "../src/index";
import { queryParametersOf, validationRulesOf } from "../src/internal";
import { getParameterInfo } from "../src/components/parameter-metadata";

class Theme {}

/** What a class's metadata says, in the readers' order. */
function described(type: abstract new () => unknown) {
  const info = getParameterInfo(type);
  return {
    parameters: [...info.all.values()],
    captureUnmatched: info.captureUnmatchedProperty,
    cascading: info.cascading.map((meta) => meta.propertyName),
    query: [...queryParametersOf(type)],
    rules: [...validationRulesOf(type)].map(([field, rules]) => [field, rules.map((rule) => rule.kind)]),
  };
}

describe("decorateFields", () => {
  it("records what the decorators record in the class", () => {
    class Decorated extends ComponentBase {
      @Parameter() title = "";
      @Parameter({ captureUnmatchedValues: true }) attributes?: Record<string, unknown>;
      @CascadingParameter({ type: Theme }) theme?: Theme;
      @Parameter() @SupplyParameterFromQuery({ name: "p" }) page = 1;
      @Required() @MaxLength(80) name = "";
    }
    class Compiled extends ComponentBase {
      title = "";
      attributes?: Record<string, unknown>;
      theme?: Theme;
      page = 1;
      name = "";
    }
    decorateFields(Compiled, {
      title: [Parameter()],
      attributes: [Parameter({ captureUnmatchedValues: true })],
      theme: [CascadingParameter({ type: Theme })],
      page: [Parameter(), SupplyParameterFromQuery({ name: "p" })],
      name: [Required(), MaxLength(80)],
    });
    expect(described(Compiled)).toEqual(described(Decorated));
    expect(described(Compiled).rules).toEqual([["name", ["required", "maxLength"]]]);
    expect(new Compiled().title).toBe("");
  });

  it("inherits either way: a compiled base under a decorated class, a decorated base under a compiled one", () => {
    class CompiledBase extends ComponentBase {
      label = "";
    }
    decorateFields(CompiledBase, { label: [Parameter()] });
    class DecoratedDerived extends CompiledBase {
      @Parameter() size = 0;
    }
    class DecoratedBase extends ComponentBase {
      @Parameter() label = "";
    }
    class CompiledDerived extends DecoratedBase {
      size = 0;
    }
    decorateFields(CompiledDerived, { size: [Parameter()] });
    const names = (type: abstract new () => unknown) => [...getParameterInfo(type).all.keys()];
    expect(names(DecoratedDerived)).toEqual(["label", "size"]);
    expect(names(CompiledDerived)).toEqual(["label", "size"]);
    expect(names(CompiledBase)).toEqual(["label"]);
    expect(names(DecoratedBase)).toEqual(["label"]);
  });

  it("refuses a decorator it can't apply afterwards: one that returns or adds an initializer", () => {
    class Target {}
    const returns: FieldDecorator = () => (value: unknown) => value;
    const adds: FieldDecorator = (_value, context) => context.addInitializer(() => {});
    expect(() => decorateFields(Target, { x: [returns] })).toThrow(/returns an initializer/);
    expect(() => decorateFields(Target, { y: [adds] })).toThrow(/adds an initializer/);
  });
});

/**
 * The static parameter metadata of the built-ins (roadmap 2.1: the runtime
 * manifest the workspace embeds, generated from these sources by the
 * syntactic extractor) must match what the decorators register at runtime —
 * names, order, captureUnmatchedValues and cascading options — so the static
 * and the runtime view cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import * as runtime from "../src/index";
import { getParameterInfo } from "../src/components/parameter-metadata";
import { RUNTIME_MANIFEST } from "../../workspace/src/runtime-manifest.generated";

type ComponentClass = abstract new () => unknown;

describe("runtime manifest vs. decorator metadata", () => {
  const exported = runtime as unknown as Record<string, unknown>;

  it("lists every exported ComponentBase subclass", () => {
    const components = Object.entries(exported)
      .filter(([, value]) => typeof value === "function" && (value === runtime.ComponentBase || (value as { prototype: unknown }).prototype instanceof runtime.ComponentBase))
      .map(([name]) => name)
      .sort();
    expect(Object.keys(RUNTIME_MANIFEST.components).sort()).toEqual(components);
  });

  for (const [name, metadata] of Object.entries(RUNTIME_MANIFEST.components)) {
    it(`${name}: same parameters as getParameterInfo`, () => {
      const type = exported[name] as ComponentClass;
      const info = getParameterInfo(type);
      const actual = [...info.all.values()].map((meta) => ({
        name: meta.propertyName,
        capture: meta.captureUnmatchedValues === true,
        cascading: meta.cascading ? { name: meta.cascadingName, type: meta.cascadingType?.name } : undefined,
      }));
      const expected = metadata.parameters.map((parameter) => ({
        name: parameter.name,
        capture: parameter.category === "captureUnmatchedValues",
        cascading: parameter.cascading ? { name: parameter.cascading.name, type: parameter.cascading.type } : undefined,
      }));
      expect(expected).toEqual(actual);
    });
  }
});

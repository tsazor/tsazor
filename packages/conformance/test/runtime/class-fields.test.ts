/**
 * A6b: standard decorators + [[Define]] class fields through the real plugin
 * pipeline — a code-behind base class (X.tsazor.ts) with fields, accessors and
 * a decorated parameter, extended by the generated class with an `@inject`
 * field and an `@code` parameter.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Renderer, ServiceCollection, type ComponentBase } from "@tsazor/runtime";
import { compileFiles, normalizeHtml } from "../harness.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const files = {
  "clock.ts": `export class Clock { now = "12:00"; }\n`,
  "Test.tsazor.ts": `import { ComponentBase, Parameter } from "@tsazor/runtime";
export default class TestBase extends ComponentBase {
  @Parameter() title = "base-title";
  count = 1;
  private _name = "ada";
  get name(): string { return this._name; }
  set name(value: string) { this._name = value.toUpperCase(); }
  get doubled(): number { return this.count * 2; }
}
`,
  "Test.tsazor": `@import { Clock } from "./clock"
@inject Clock clock
<p>@title|@label|@name|@count/@doubled|@clock.now</p>
@code {
    @Parameter() label = "hi";
}`,
  "Host.tsazor": `<Test Title="T" Label="L" />`,
};

describe("code-behind + generated class under [[Define]]", () => {
  it("keeps code-behind initializers and accessors, resolves @inject, sets parameters of both classes", async () => {
    const compiled = await compileFiles(files);
    const errors = Object.values(compiled.diagnostics).flat().filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
    const { Clock } = (await import(/* @vite-ignore */ `${compiled.dir}/clock.ts`)) as { Clock: new () => { now: string } };
    const { default: Host } = await import(/* @vite-ignore */ compiled.modules["Host.tsazor"]!);

    // Same token instance the compiled module imports: the services resolve it.
    const renderer = new Renderer(new ServiceCollection().registerType(Clock).build());
    const failures: unknown[] = [];
    renderer.errorHandler = ({ error }) => failures.push(error);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const host = renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    expect(failures).toEqual([]);
    expect(normalizeHtml(container.innerHTML)).toBe("<p>T|L|ada|1/2|12:00</p>");

    const child = renderer.getComponentState(host.id + 1)!.component as ComponentBase & { name: string };
    expect(Object.hasOwn(child, "name")).toBe(false);
    child.name = "bo";
    expect(child.name).toBe("BO");
  });
});

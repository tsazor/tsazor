/**
 * End-to-end: compile a .tsazor source, bundle it with esbuild against the real
 * runtime, execute it and render through the Renderer in happy-dom. This is
 * the M2 acceptance gate: markup → generated module → DOM.
 */
import { describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import { compile } from "../src/compile";
import path from "node:path";

const RUNTIME = path.resolve(__dirname, "../../runtime/src/index.ts");

async function instantiate(tsCode: string, stubs?: { name: string; contents: string }[]): Promise<Record<string, unknown>> {
  const stubPlugin = {
    name: "tsazor-test-stubs",
    setup(build: esbuild.PluginBuild): void {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path === "tsazor:component" || stubs?.some((s) => s.name === args.path)) {
          return { path: args.path, namespace: "stub" };
        }
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
        if (args.path === "tsazor:component") return { contents: tsCode, loader: "ts", resolveDir: process.cwd() };
        const stub = stubs?.find((s) => s.name === args.path);
        return stub ? { contents: stub.contents, loader: "ts", resolveDir: process.cwd() } : undefined;
      });
    },
  };
  // The wrapper imports the compiled component and re-exports the runtime,
  // so the test and the component share ONE runtime module instance — a
  // second copy would break `instanceof EventCallback` checks in the renderer.
  const wrapper = `import Comp from "tsazor:component";\nexport default Comp;\nexport * from "@tsazor/runtime";\n`;
  const result = await esbuild.build({
    stdin: { contents: wrapper, resolveDir: process.cwd(), loader: "ts", sourcefile: "wrapper.ts" },
    bundle: true,
    format: "esm",
    platform: "browser",
    alias: { "@tsazor/runtime": RUNTIME },
    write: false,
    sourcemap: false,
    plugins: [stubPlugin],
    // stdin input does not trigger esbuild's tsconfig discovery — pass the
    // repo-wide settings explicitly; standard decorators are lowered (Node
    // does not run them natively).
    supported: { decorators: false },
    tsconfigRaw: JSON.stringify({ compilerOptions: { target: "es2022" } }),
  });
  const js = result.outputFiles[0]!.text;
  const url = `data:text/javascript;base64,${Buffer.from(js, "utf8").toString("base64")}`;
  return (await import(url)) as Record<string, unknown>;
}

describe("compiler end-to-end (markup → generated module → runtime DOM)", () => {
  it("renders a compiled Counter and handles events", async () => {
    const source = `
<h1 class="title">Count: @count</h1>
<button @onclick="increment">+</button>

@code {
  count = 0;
  readonly increment = (): void => {
    this.count++;
  };
}
`;
    const { code, diagnostics } = compile(source, { className: "Counter", fileName: "Counter.tsazor", generateSourceMap: false });
    expect(diagnostics.hasErrors).toBe(false);

    const mod = await instantiate(code);
    const Counter = mod.default as abstract new () => unknown;
    const { Renderer } = mod as unknown as typeof import("../../runtime/src/index");
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Counter as never, container);
    await renderer.waitUntilIdle();

    expect(container.querySelector("h1")?.textContent).toBe("Count: 0");
    expect(container.querySelector("h1")?.getAttribute("class")).toBe("title");

    const button = container.querySelector("button")!;
    button.dispatchEvent(new Event("click"));
    await renderer.waitUntilIdle();
    expect(container.querySelector("h1")?.textContent).toBe("Count: 1");
  });

  it("renders components, if/else and foreach with keys", async () => {
    const stubGreeter = `
import { ComponentBase, Parameter } from "@tsazor/runtime";
export default class Greeter extends ComponentBase {
  @Parameter() name = "";
  buildRenderTree(b: any): void {
    b.openElement(0, "p");
    b.addAttribute(1, "class", "greet");
    b.addContent(2, "Hello, " + (this.name ?? "") + "!");
    b.closeElement();
  }
}
`;
    const parentSource = `
<div>
  @if (show) {
    <Greeter Name="@greeting" />
  } else {
    <span>hidden</span>
  }
  <ul>
    @foreach (var item in items) {
      <li @key="item">@item</li>
    }
  </ul>
</div>

@code {
  @Parameter() show = true;
  greeting = "World";
  items = ["a", "b"];
}
`;
    const { code } = compile(parentSource, {
      className: "Parent",
      generateSourceMap: false,
      resolveComponent: (tag) => (tag === "Greeter" ? { specifier: "./Greeter.tsazor" } : null),
    });

    const mod = await instantiate(code, [{ name: "./Greeter.tsazor", contents: stubGreeter }]);
    const Parent = mod.default as abstract new () => unknown;
    const { Renderer } = mod as unknown as typeof import("../../runtime/src/index");
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Parent as never, container);
    await renderer.waitUntilIdle();

    expect(container.querySelector("p")?.textContent).toBe("Hello, World!");
    const lis = [...container.querySelectorAll("li")];
    expect(lis.map((li) => li.textContent)).toEqual(["a", "b"]);
  });

  it("emits inject property and import for @inject", () => {
    const source = `
<p>@Clock.now</p>
@inject ClockService Clock

@code {
}
`;
    const { code, diagnostics } = compile(source, {
      className: "ClockDemo",
      generateSourceMap: false,
      resolveType: (name) => (name === "ClockService" ? { specifier: "./clock" } : null),
    });
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain("private readonly Clock = __tsazor_inject(ClockService);");
    expect(code).toContain('import ClockService from "./clock";');
  });

  it("binds an input through @bind: DOM change updates component state and DOM", async () => {
    const source = `
<div>
  <input @bind="name" data-testid="name-input" />
  <p>Hello, @name</p>
  <input @bind="amount" type="number" data-testid="amount-input" />
  <p>Amount: @amount</p>
</div>

@code {
  name = "";
  amount = 0;
}
`;
    const { code, diagnostics } = compile(source, { className: "BindDemo", generateSourceMap: false });
    expect(diagnostics.hasErrors).toBe(false);

    const mod = await instantiate(code);
    const BindDemo = mod.default as abstract new () => unknown;
    const { Renderer } = mod as unknown as typeof import("../../runtime/src/index");
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(BindDemo as never, container);
    await renderer.waitUntilIdle();

    const nameInput = container.querySelector('[data-testid="name-input"]') as HTMLInputElement;
    nameInput.value = "Tsazor";
    nameInput.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    expect(container.querySelectorAll("p")[0]?.textContent).toBe("Hello, Tsazor");

    const amountInput = container.querySelector('[data-testid="amount-input"]') as HTMLInputElement;
    amountInput.value = "42";
    amountInput.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    // The number input coerces to a numeric value via @bind's type extraction.
    expect((container.querySelectorAll("p")[1]?.textContent)).toBe("Amount: 42");
  });

  it("binds a component parameter with @bind-Value (Value + ValueChanged)", async () => {
    const stubStepper = `
import { ComponentBase, Parameter, EventCallback, defineComponent } from "@tsazor/runtime";
export default class Stepper extends ComponentBase {
  @Parameter() value = 0;
  @Parameter() valueChanged?: EventCallback<number>;
  buildRenderTree(b: any): void {
    b.openElement(0, "button");
    b.addAttribute(1, "data-testid", "step");
    b.addEventHandler(2, "onclick", EventCallback.bind(this, () => {
      this.value = (this.value ?? 0) + 1;
      this.valueChanged?.invokeAsync(this.value);
    }));
    b.addContent(3, "value: " + (this.value ?? 0));
    b.closeElement();
  }
}
`;
    const source = `
<Stepper @bind-Value="current" />
<p data-testid="current">Current: @current</p>

@code {
  current = 5;
}
`;
    const { code } = compile(source, {
      className: "BindComponent",
      generateSourceMap: false,
      resolveComponent: (tag) => (tag === "Stepper" ? { specifier: "./Stepper.tsazor" } : null),
    });

    const mod = await instantiate(code, [{ name: "./Stepper.tsazor", contents: stubStepper }]);
    const Demo = mod.default as abstract new () => unknown;
    const { Renderer } = mod as unknown as typeof import("../../runtime/src/index");
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Demo as never, container);
    await renderer.waitUntilIdle();

    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe("Current: 5");
    (container.querySelector('[data-testid="step"]') as HTMLElement).dispatchEvent(new Event("click"));
    await renderer.waitUntilIdle();
    expect(container.querySelector('[data-testid="current"]')?.textContent).toBe("Current: 6");
  });

  it("sourcemap maps a generated builder call back into the .tsazor file", () => {
    const source = "<p>@Title</p>\n";
    const { code, map } = compile(source, { className: "Smap", fileName: "Smap.tsazor" });
    expect(map).toBeDefined();
    const parsed = JSON.parse(map!);
    expect(parsed.version).toBe(3);
    expect(parsed.sources).toContain("Smap.tsazor");
    expect(code).toContain('__builder.addContent(1, this.Title);');
  });

  it("sourcemap decodes 1-based via trace-mapping on both sides (convention pin)", async () => {
    // gen-mapping/trace-mapping 0.3.x APIs take 1-BASED lines both directions
    // (verified empirically) — this test pins the round trip so later refactors
    // of the chain don't silently break the DevTools debugging story.
    const source = "<p>@Title</p>\n";
    const { code, map } = compile(source, { className: "Smap", fileName: "Smap.tsazor" });
    const genLine0 = code.split("\n").findIndex((l) => l.includes("__builder.addContent(1, this.Title);"));
    const { TraceMap, originalPositionFor, generatedPositionFor } = await import("@jridgewell/trace-mapping");
    const trace = new TraceMap(JSON.parse(map!));
    const orig = originalPositionFor(trace, { line: genLine0 + 1, column: 4 });
    expect(orig.line).toBe(1);      // .tsazor line 1 (trace-mapping 1-based)
    expect(orig.column).toBe(3);    // the '@'
    const back = generatedPositionFor(trace, { source: "Smap.tsazor", line: 1, column: 3 });
    expect(back.line).toBe(genLine0 + 1);
  });

  it("exposes the raw per-statement mappings for position-aware tooling (LSP)", () => {
    const { mappings, map } = compile('<p>@Title</p>', { className: "Raw", fileName: "Raw.tsazor", generateSourceMap: false });
    expect(mappings).toBeDefined();
    expect(map).toBeUndefined();
    expect(mappings!.some((m) => m.srcLine === 0 && m.srcCol === 4)).toBe(true); // `Title` token
  });

  it("applies the scope attribute to rendered DOM when scopeHash is set", async () => {
    const source = `
<div><p class="inner">Hello</p></div>

@code {
  title = "";
}
`;
    const { code, diagnostics } = compile(source, {
      className: "Scoped",
      fileName: "Scoped.tsazor",
      generateSourceMap: false,
      scopeHash: "b-1a2b3c4d",
    });
    expect(diagnostics.hasErrors).toBe(false);

    const mod = await instantiate(code);
    const Scoped = mod.default as abstract new () => unknown;
    const { Renderer } = mod as unknown as typeof import("../../runtime/src/index");
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Scoped as never, container);
    await renderer.waitUntilIdle();

    // Both plain elements carry the scope attribute, matched by the CSS attr selector.
    expect(container.querySelectorAll('[b-1a2b3c4d]').length).toBe(2);
  });

  it("renders a component whose state lives in a code-behind class (extends chain)", async () => {
    const source = `
<h1 data-testid="count">Count: @count</h1>
<button data-testid="inc" @onclick="increment">+</button>
<p data-testid="double">@doubleCount</p>
`;
    // The sidecar is what Vite would compile from the sibling X.tsazor.ts.
    const sidecar = `
import { ComponentBase } from "@tsazor/runtime";
export default class BeCode extends ComponentBase {
  count = 0;
  increment(): void { this.count++; }
  get doubleCount(): number { return this.count * 2; }
}
`;
    const { code, diagnostics } = compile(source, {
      className: "Counter",
      fileName: "Counter.tsazor",
      generateSourceMap: false,
      codeBehindClass: "CounterBase",
      imports: ['import CounterBase from "./Counter.tsazor.ts";'],
    });
    expect(diagnostics.hasErrors).toBe(false);
    expect(code).toContain("export default class Counter extends CounterBase {");
    expect(code).not.toContain("extends ComponentBase");

    const mod = await instantiate(code, [{ name: "./Counter.tsazor.ts", contents: sidecar }]);
    const Counter = mod.default as abstract new () => unknown;
    const { Renderer } = mod as unknown as typeof import("../../runtime/src/index");
    const container = document.createElement("div");
    const renderer = new Renderer();
    renderer.renderInContainer(Counter as never, container);
    await renderer.waitUntilIdle();

    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe("Count: 0");
    expect(container.querySelector('[data-testid="double"]')?.textContent).toBe("0");

    (container.querySelector('[data-testid="inc"]') as HTMLElement).dispatchEvent(new Event("click"));
    await renderer.waitUntilIdle();
    // State lives on the code-behind class; markup renders through the chain.
    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe("Count: 1");
    // Bare markup identifiers (baked to this.*) resolve to code-behind members.
    expect(container.querySelector('[data-testid="double"]')?.textContent).toBe("2");
  });
});
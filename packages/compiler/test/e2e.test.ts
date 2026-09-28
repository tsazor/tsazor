/**
 * End-to-end: compile a .tazor source, bundle it with esbuild against the real
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
    name: "tasor-test-stubs",
    setup(build: esbuild.PluginBuild): void {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path === "tasor:component" || stubs?.some((s) => s.name === args.path)) {
          return { path: args.path, namespace: "stub" };
        }
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
        if (args.path === "tasor:component") return { contents: tsCode, loader: "ts", resolveDir: process.cwd() };
        const stub = stubs?.find((s) => s.name === args.path);
        return stub ? { contents: stub.contents, loader: "ts", resolveDir: process.cwd() } : undefined;
      });
    },
  };
  // The wrapper imports the compiled component and re-exports the runtime,
  // so the test and the component share ONE runtime module instance — a
  // second copy would break `instanceof EventCallback` checks in the renderer.
  const wrapper = `import Comp from "tasor:component";\nexport default Comp;\nexport * from "@tasor/runtime";\n`;
  const result = await esbuild.build({
    stdin: { contents: wrapper, resolveDir: process.cwd(), loader: "ts", sourcefile: "wrapper.ts" },
    bundle: true,
    format: "esm",
    platform: "browser",
    alias: { "@tasor/runtime": RUNTIME },
    write: false,
    sourcemap: false,
    plugins: [stubPlugin],
    // stdin input does not trigger esbuild's tsconfig discovery — pass the
    // repo-wide settings explicitly so experimental decorators are transpiled.
    tsconfigRaw: JSON.stringify({ compilerOptions: { experimentalDecorators: true } }),
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
    const { code, diagnostics } = compile(source, { className: "Counter", fileName: "Counter.tazor", generateSourceMap: false });
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
import { ComponentBase, Parameter } from "@tasor/runtime";
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
      resolveComponent: (tag) => (tag === "Greeter" ? { specifier: "./Greeter.tazor" } : null),
    });

    const mod = await instantiate(code, [{ name: "./Greeter.tazor", contents: stubGreeter }]);
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
    expect(code).toContain("private readonly Clock = inject(ClockService);");
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
    nameInput.value = "Tasor";
    nameInput.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    expect(container.querySelectorAll("p")[0]?.textContent).toBe("Hello, Tasor");

    const amountInput = container.querySelector('[data-testid="amount-input"]') as HTMLInputElement;
    amountInput.value = "42";
    amountInput.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    // The number input coerces to a numeric value via @bind's type extraction.
    expect((container.querySelectorAll("p")[1]?.textContent)).toBe("Amount: 42");
  });

  it("binds a component parameter with @bind-Value (Value + ValueChanged)", async () => {
    const stubStepper = `
import { ComponentBase, Parameter, EventCallback, defineComponent } from "@tasor/runtime";
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
      resolveComponent: (tag) => (tag === "Stepper" ? { specifier: "./Stepper.tazor" } : null),
    });

    const mod = await instantiate(code, [{ name: "./Stepper.tazor", contents: stubStepper }]);
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

  it("sourcemap maps a generated builder call back into the .tazor file", () => {
    const source = "<p>@Title</p>\n";
    const { code, map } = compile(source, { className: "Smap", fileName: "Smap.tazor" });
    expect(map).toBeDefined();
    const parsed = JSON.parse(map!);
    expect(parsed.version).toBe(3);
    expect(parsed.sources).toContain("Smap.tazor");
    expect(code).toContain('b.addContent(1, this.Title);');
  });
});
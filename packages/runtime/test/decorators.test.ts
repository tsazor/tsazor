/**
 * A6b: standard (TC39) parameter decorators — metadata per class in
 * `Class[Symbol.metadata]`, inheritance, the per-class cache — and the
 * [[Define]] class-field semantics the generated code relies on (code-behind
 * base classes, `inject()` field initializers, HMR state retention).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  CascadingParameter,
  ComponentBase,
  Parameter,
  Renderer,
  ServiceCollection,
  defineComponent,
  inject,
  type RenderTreeBuilder,
} from "../src/index";
import {
  defineParameter,
  getOwnParameterMetadata,
  getParameterInfo,
  type ParameterMeta,
} from "../src/components/parameter-metadata";

const METADATA = (Symbol as unknown as { metadata: symbol }).metadata;

afterEach(() => {
  document.body.innerHTML = "";
});

/** Renders `type` as the only child of a host, passing `parameters`. */
async function mountWith(
  type: abstract new () => ComponentBase,
  parameters: Record<string, unknown>,
  services = new ServiceCollection().build(),
): Promise<{ container: HTMLElement; child: () => ComponentBase; renderer: Renderer }> {
  class Host extends ComponentBase {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openComponent(0, defineComponent(type));
      let seq = 1;
      for (const [name, value] of Object.entries(parameters)) b.addAttribute(seq++, name, value as never);
      b.closeComponent();
    }
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer(services);
  const host = renderer.renderInContainer(Host, container);
  await renderer.waitUntilIdle();
  // The only child is the next component the renderer created.
  return { container, child: () => renderer.getComponentState(host.id + 1)!.component, renderer };
}

describe("decorator metadata", () => {
  it("installs Symbol.metadata (esbuild's fallback symbol unless the engine has one)", () => {
    expect(typeof METADATA).toBe("symbol");
    expect(METADATA === Symbol.for("Symbol.metadata") || METADATA.description === "Symbol.metadata").toBe(true);
  });

  it("records each decorated field in its own class's metadata", () => {
    class Card extends ComponentBase {
      @Parameter() title = "";
      @Parameter({ captureUnmatchedValues: true }) rest?: Record<string, unknown>;
      plain = 1;
    }
    expect(Object.hasOwn(Card, METADATA)).toBe(true);
    const own = getOwnParameterMetadata(Card)!;
    expect([...own.keys()]).toEqual(["title", "rest"]);
    expect(own.get("title")).toEqual({ propertyName: "title", captureUnmatchedValues: undefined });
    expect(own.get("rest")!.captureUnmatchedValues).toBe(true);
    expect(getParameterInfo(Card).captureUnmatchedProperty).toBe("rest");
  });

  it("records cascading parameters by name and by type", () => {
    class Theme {}
    class Consumer extends ComponentBase {
      @CascadingParameter({ name: "Accent" }) accent?: string;
      @CascadingParameter({ type: Theme }) theme?: Theme;
      @Parameter() size = 1;
    }
    const info = getParameterInfo(Consumer);
    expect(info.cascading.map((m: ParameterMeta) => [m.propertyName, m.cascadingName, m.cascadingType])).toEqual([
      ["accent", "Accent", undefined],
      ["theme", undefined, Theme],
    ]);
    expect(info.all.get("size")!.cascading).toBeUndefined();
  });

  it("supports auto-accessors and setters as parameters", async () => {
    const writes: string[] = [];
    class Accessors extends ComponentBase {
      @Parameter() accessor label = "";
      private _tone = "";
      @Parameter() set tone(value: string) {
        writes.push(value);
        this._tone = value;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, `${this.label}/${this._tone}`);
      }
    }
    const { container } = await mountWith(Accessors, { Label: "a", tone: "warm" });
    expect(container.textContent).toBe("a/warm");
    expect(writes).toEqual(["warm"]);
  });

  it("rejects static and #private members", () => {
    expect(() => {
      class Static extends ComponentBase {
        @Parameter() static title = "";
      }
      return Static;
    }).toThrow(/public instance members/);
    expect(() => {
      class Private extends ComponentBase {
        @Parameter() #title = "";
        get title(): string {
          return this.#title;
        }
      }
      return Private;
    }).toThrow(/public instance members/);
  });

  it("explains a legacy (experimentalDecorators) call", () => {
    class Legacy extends ComponentBase {}
    const legacy = Parameter() as unknown as (target: object, key: string) => void;
    expect(() => legacy(Legacy.prototype, "title")).toThrow(/standard \(TC39\) decorator/);
  });
});

describe("inheritance", () => {
  class Base extends ComponentBase {
    @Parameter() shared = "base";
    @Parameter() overridden?: string;
  }
  class Derived extends Base {
    @CascadingParameter({ name: "Overridden" }) override overridden?: string = undefined;
    @Parameter() own = 0;
  }
  class Undecorated extends Derived {
    extra = true;
  }

  it("includes base-class parameters; a derived re-declaration wins", () => {
    const all = getParameterInfo(Derived).all;
    expect([...all.keys()]).toEqual(["shared", "overridden", "own"]);
    expect(all.get("overridden")!.cascading).toBe(true);
    expect(all.get("overridden")!.cascadingName).toBe("Overridden");
  });

  it("keeps each class's own metadata separate (no write-through to the base)", () => {
    expect([...getOwnParameterMetadata(Base)!.keys()]).toEqual(["shared", "overridden"]);
    expect(getOwnParameterMetadata(Base)!.get("overridden")!.cascading).toBeUndefined();
    expect([...getOwnParameterMetadata(Derived)!.keys()]).toEqual(["overridden", "own"]);
    // The metadata objects inherit like the classes do.
    const derivedMeta = (Derived as unknown as Record<symbol, object>)[METADATA]!;
    expect(Object.getPrototypeOf(derivedMeta)).toBe((Base as unknown as Record<symbol, object>)[METADATA]);
  });

  it("an undecorated subclass inherits every parameter", async () => {
    expect(getOwnParameterMetadata(Undecorated)).toBeUndefined();
    expect([...getParameterInfo(Undecorated).all.keys()]).toEqual(["shared", "overridden", "own"]);
    const { child } = await mountWith(Undecorated, { Shared: "x", own: 2 });
    expect((child() as Undecorated).shared).toBe("x");
    expect((child() as Undecorated).own).toBe(2);
  });
});

describe("metadata cache", () => {
  it("is stable across later class definitions", () => {
    class First extends ComponentBase {
      @Parameter() a = "";
    }
    const info = getParameterInfo(First);
    class Second extends First {
      @Parameter() b = "";
    }
    expect(getParameterInfo(Second).all.size).toBe(2);
    expect(getParameterInfo(First)).toBe(info);
  });

  it("is rebuilt after defineParameter, which also creates metadata for an undecorated class", () => {
    class Plain extends ComponentBase {
      label = "";
    }
    class Child extends Plain {
      @Parameter() size = 0;
    }
    const before = getParameterInfo(Child);
    expect([...before.all.keys()]).toEqual(["size"]);
    defineParameter(Plain, "label");
    expect(Object.hasOwn(Plain, METADATA)).toBe(true);
    const after = getParameterInfo(Child);
    expect(after).not.toBe(before);
    expect([...after.all.keys()]).toEqual(["label", "size"]);
    defineParameter(Plain, "theme", { cascading: true, cascadingName: "Theme" });
    expect(getParameterInfo(Plain).cascading.map((m) => m.propertyName)).toEqual(["theme"]);
  });
});

describe("[[Define]] class fields", () => {
  class Clock {
    now = "12:00";
  }

  // Code-behind (X.tsazor.ts): fields, an accessor pair and a getter.
  class GreeterBase extends ComponentBase {
    count = 1;
    loadedAt = "";
    private _name = "base";
    get name(): string {
      return this._name;
    }
    set name(value: string) {
      this._name = value.toUpperCase();
    }
    get doubled(): number {
      return this.count * 2;
    }
    protected override onInitialized(): void {
      this.loadedAt = "init";
    }
  }

  // The class the compiler generates from X.tsazor: `@inject` field, @code
  // members (a parameter), buildRenderTree.
  class Greeter extends GreeterBase {
    private readonly clock = inject(Clock);
    @Parameter() label = "hi";
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.addContent(0, `${this.label} ${this.name} ${this.count}/${this.doubled} ${this.loadedAt} ${this.clock.now}`);
    }
  }

  it("generated fields sit on top of the code-behind's without shadowing its accessors", async () => {
    const services = new ServiceCollection().registerValue(Clock, new Clock()).build();
    const { container, child } = await mountWith(Greeter, { Label: "hey" }, services);
    expect(container.textContent).toBe("hey base 1/2 init 12:00");
    const instance = child() as Greeter;
    expect(Object.hasOwn(instance, "name")).toBe(false);
    instance.name = "ada";
    expect(instance.name).toBe("ADA");
  });

  it("inject() resolves from the ambient services while field initializers run", async () => {
    const clock = new Clock();
    clock.now = "13:37";
    const services = new ServiceCollection().registerValue(Clock, clock).build();
    const { container } = await mountWith(Greeter, {}, services);
    expect(container.textContent).toContain("13:37");
    expect(() => new Greeter()).toThrow(/outside component construction/);
  });

  it("a re-declared field resets the base value; `declare` keeps it", () => {
    class Redeclared extends GreeterBase {
      // Standard semantics: a field without initializer is defined as undefined
      // (TS flags it, TS2612 — the hint to write `declare`).
      // @ts-expect-error TS2612
      count!: number;
    }
    class Declared extends GreeterBase {
      declare count: number;
    }
    expect(new Redeclared().count).toBeUndefined();
    expect(new Declared().count).toBe(1);
  });

  it("uninitialized fields are own properties (visible to the unknown-parameter message)", async () => {
    class Plain extends ComponentBase {
      title?: string;
    }
    expect(Object.hasOwn(new Plain(), "title")).toBe(true);
    const renderer = new Renderer();
    const errors: unknown[] = [];
    renderer.errorHandler = ({ error }) => errors.push(error);
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(Plain));
        b.addAttribute(1, "title", "x");
        b.closeComponent();
      }
    }
    renderer.renderInContainer(Host, document.createElement("div"));
    await renderer.waitUntilIdle();
    expect(String(errors[0])).toMatch(/has a property matching the name 'title', but it is not declared as @Parameter\(\)/);
  });
});

describe("HMR state retention with standard fields", () => {
  let instance: ComponentBase | undefined;

  const ViewV1 = class View extends ComponentBase {
    @Parameter() label = "";
    count = 3;
    mode = "field";
    pending?: string;
    protected override onInitialized(): void {
      instance = this;
    }
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.addContent(0, `v1 ${this.label} ${this.count} ${this.mode}`);
    }
  };

  const ViewV2 = class View extends ComponentBase {
    @Parameter() label = "";
    @Parameter() size = 1;
    count = 0;
    added = "seeded";
    pending?: string;
    get mode(): string {
      return "getter";
    }
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.addContent(0, `v2 ${this.label} ${this.count} ${this.mode} ${this.added} ${this.size}`);
    }
  };

  it("keeps field values, seeds new fields, un-shadows new accessors, uses the new metadata", async () => {
    let size: number | undefined;
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, ViewV1);
        b.addAttribute(1, "label", "L");
        if (size !== undefined) b.addAttribute(2, "size", size);
        b.closeComponent();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    const host = renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("v1 L 3 field");
    const before = instance!;

    expect(renderer.hmrSwap(ViewV1, ViewV2)).toBe(1);
    await renderer.waitUntilIdle();
    expect(instance).toBe(before);
    expect(Object.hasOwn(before, "mode")).toBe(false);
    expect(container.textContent).toBe("v2 L 3 getter seeded 1");

    // The swapped instance reads its parameters from the new class's metadata.
    size = 5;
    host.component.stateHasChangedInternal();
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("v2 L 3 getter seeded 5");
  });
});

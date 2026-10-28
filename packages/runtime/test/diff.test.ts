import { componentInternals } from "../src/components/component-internals";
/**
 * Edit-list tests for the RenderTreeDiffBuilder port (roadmap B1): the diff is
 * pure data, so these check edits and component lists directly, plus a few
 * DOM-level checks of the applier.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, Parameter, RenderTreeBuilder, defineComponent, type RenderTreeFrame } from "../src/index";
import { Renderer, computeDiff, type RenderError, type RenderTreeDiff } from "../src/internal";
import { RenderTreeEditType } from "../src/render-tree/diff";

type Build = (b: RenderTreeBuilder) => void;

function frames(build: Build): RenderTreeFrame[] {
  const b = new RenderTreeBuilder();
  build(b);
  return b.getFrames();
}

function diff(oldBuild: Build | null, newBuild: Build, options?: Parameters<typeof computeDiff>[2]): RenderTreeDiff & { newTree: RenderTreeFrame[] } {
  const newTree = frames(newBuild);
  return { ...computeDiff(oldBuild ? frames(oldBuild) : [], newTree, options), newTree };
}

/** Compact edit notation: "prepend 0 #3", "remove 1", "in 0", "out", "perm 0->2", … */
function show(result: RenderTreeDiff): string[] {
  return result.edits.map((e) => {
    switch (e.type) {
      case RenderTreeEditType.PrependFrame: return `prepend ${e.siblingIndex} #${e.referenceFrameIndex}`;
      case RenderTreeEditType.RemoveFrame: return `remove ${e.siblingIndex}`;
      case RenderTreeEditType.SetAttribute: return `set ${e.siblingIndex} #${e.referenceFrameIndex}`;
      case RenderTreeEditType.RemoveAttribute: return `rmattr ${e.siblingIndex} ${e.removedAttributeName}`;
      case RenderTreeEditType.UpdateText: return `text ${e.siblingIndex} #${e.referenceFrameIndex}`;
      case RenderTreeEditType.UpdateMarkup: return `markup ${e.siblingIndex} #${e.referenceFrameIndex}`;
      case RenderTreeEditType.StepIn: return `in ${e.siblingIndex}`;
      case RenderTreeEditType.StepOut: return "out";
      case RenderTreeEditType.PermutationListEntry: return `perm ${e.siblingIndex}->${e.moveToSiblingIndex}`;
      case RenderTreeEditType.PermutationListEnd: return "permEnd";
      default: return "?";
    }
  });
}

class Child extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, "c");
  }
}
class Other extends ComponentBase {}

const list = (items: Array<string | number>, keyed: boolean): Build => (b) => {
  b.openElement(0, "ul");
  for (const item of items) {
    b.openElement(1, "li");
    if (keyed) b.setKey(item);
    b.addContent(2, String(item));
    b.closeElement();
  }
  b.closeElement();
};

describe("computeDiff — sequence matching", () => {
  it("initial render: one PrependFrame per top-level frame, components queued for instantiation", () => {
    const result = diff(null, (b) => {
      b.openElement(0, "div");
      b.openComponent(1, Child);
      b.closeComponent();
      b.closeElement();
      b.addContent(2, "t");
    });
    expect(show(result)).toEqual(["prepend 0 #0", "prepend 1 #2"]);
    expect(result.components).toEqual([-1, 1]);
    expect(result.disposedComponents).toEqual([]);
  });

  it("an unchanged tree produces no edits (StepIn/StepOut cancel out)", () => {
    const build = list(["a", "b"], false);
    expect(show(diff(build, build))).toEqual([]);
  });

  it("a text change steps into the element and updates in place", () => {
    const result = diff(list(["a", "b"], false), list(["a", "x"], false));
    expect(show(result)).toEqual(["in 0", "in 1", "text 0 #4", "out", "out"]);
  });

  it("content inserted before existing siblings is a single PrependFrame", () => {
    const build = (withNew: boolean): Build => (b) => {
      if (withNew) b.addContent(0, "N");
      b.openElement(1, "input");
      b.closeElement();
      b.addMarkupContent(2, "<u>M</u>");
    };
    expect(show(diff(build(false), build(true)))).toEqual(["prepend 0 #0"]);
    expect(show(diff(build(true), build(false)))).toEqual(["remove 0"]);
  });

  it("loops: shrinking removes trailing iterations, keeps the following sibling", () => {
    const build = (n: number): Build => (b) => {
      for (let i = 0; i < n; i++) b.addContent(1, `i${i}`);
      b.addContent(2, "after");
    };
    expect(show(diff(build(3), build(1)))).toEqual(["remove 1", "remove 1"]);
    expect(show(diff(build(1), build(3)))).toEqual(["prepend 1 #1", "prepend 2 #2"]);
  });

  it("regions are flattened into the surrounding sibling indices", () => {
    const build = (inner: string[]): Build => (b) => {
      b.addContent(0, "before");
      b.addContent(1, (rb: RenderTreeBuilder) => {
        for (const text of inner) rb.addContent(2, text);
      });
      b.addContent(3, "after");
    };
    expect(show(diff(build(["x"]), build(["x", "y"])))).toEqual(["prepend 2 #3"]);
  });

  it("an element whose tag changes is replaced; nested components are re-created and disposed", () => {
    const build = (tag: string): Build => (b) => {
      b.openElement(0, tag);
      b.openComponent(1, Child);
      b.closeComponent();
      b.closeElement();
    };
    const result = diff(build("div"), build("section"));
    expect(show(result)).toEqual(["prepend 0 #0", "remove 1"]);
    expect(result.components).toEqual([-1, 1]);
    expect(result.disposedComponents).toEqual([1]);
  });

  it("components nested at any depth of a removed element are disposed", () => {
    const build = (show: boolean): Build => (b) => {
      if (show) {
        b.openElement(0, "div");
        b.openElement(1, "p");
        b.openComponent(2, Child);
        b.closeComponent();
        b.closeElement();
        b.openComponent(3, Child);
        b.closeComponent();
        b.closeElement();
      }
    };
    const result = diff(build(true), build(false));
    expect(show(result)).toEqual(["remove 0"]);
    expect(result.disposedComponents).toEqual([2, 3]);
  });

  it("retains a component of the same type and replaces one of another type", () => {
    const build = (type: typeof Child): Build => (b) => {
      b.openComponent(0, type);
      b.addAttribute(1, "value", 1);
      b.closeComponent();
    };
    const same = diff(build(Child), build(Child));
    expect(show(same)).toEqual([]);
    expect(same.components).toEqual([0, 0]);

    const other = diff(build(Child), build(Other));
    expect(show(other)).toEqual(["prepend 0 #0", "remove 1"]);
    expect(other.components).toEqual([-1, 0]);
    expect(other.disposedComponents).toEqual([0]);

    const tolerant = diff(build(Child), build(Other), { isSameComponentType: () => true });
    expect(tolerant.components).toEqual([0, 0]);
  });
});

describe("computeDiff — keys", () => {
  it("a changed key removes the old item and inserts a new one (never matched by sequence)", () => {
    const build = (key: string): Build => (b) => {
      b.openComponent(0, Child);
      b.setKey(key);
      b.closeComponent();
    };
    const result = diff(build("x"), build("y"));
    expect(show(result)).toEqual(["prepend 0 #0", "remove 1"]);
    expect(result.components).toEqual([-1, 0]);
    expect(result.disposedComponents).toEqual([0]);
  });

  it("a key present on one side only does not match the unkeyed frame of the same sequence", () => {
    const keyed = (b: RenderTreeBuilder): void => {
      b.openElement(0, "p");
      b.setKey(1);
      b.closeElement();
    };
    const unkeyed = (b: RenderTreeBuilder): void => {
      b.openElement(0, "p");
      b.closeElement();
    };
    expect(show(diff(keyed, unkeyed))).toEqual(["remove 0", "prepend 0 #0"]);
  });

  it("a keyed loop that shrinks keeps the unkeyed sibling after it (an Autocomplete's input after its chips)", () => {
    const field = (chips: string[]): Build => (b) => {
      b.openElement(0, "div");
      for (const chip of chips) {
        b.openElement(1, "span");
        b.setKey(chip);
        b.addContent(2, chip);
        b.closeElement();
      }
      b.openElement(3, "input");
      b.closeElement();
      b.closeElement();
    };
    // The input is matched, not re-created: a re-created input drops the focus of the user typing in it.
    expect(show(diff(field(["Red", "Blue"]), field(["Red"])))).toEqual(["in 0", "remove 1", "out"]);
    expect(show(diff(field(["Red"]), field([])))).toEqual(["in 0", "remove 0", "out"]);
    expect(show(diff(field(["Red"]), field(["Red", "Blue"])))).toEqual(["in 0", "prepend 1 #3", "out"]);
  });

  it("inserting at the front of a keyed list is one PrependFrame", () => {
    expect(show(diff(list(["b", "c"], true), list(["a", "b", "c"], true)))).toEqual(["in 0", "prepend 0 #1", "out"]);
  });

  it("removing from the middle of a keyed list is one RemoveFrame", () => {
    expect(show(diff(list(["a", "b", "c"], true), list(["a", "c"], true)))).toEqual(["in 0", "remove 1", "out"]);
  });

  it("moves are a permutation list after the level's edits", () => {
    const result = diff(list(["a", "b", "c"], true), list(["c", "a", "b"], true));
    expect(show(result)).toEqual(["in 0", "perm 0->1", "perm 1->2", "perm 2->0", "permEnd", "out"]);
  });

  it("a moved item that also changed is updated in place before the permutation", () => {
    const build = (items: Array<[string, string]>): Build => (b) => {
      for (const [key, text] of items) {
        b.openElement(0, "p");
        b.setKey(key);
        b.addContent(1, text);
        b.closeElement();
      }
    };
    const result = diff(build([["a", "1"], ["b", "2"]]), build([["b", "2"], ["a", "changed"]]));
    // slot 0 holds old "a" (diffed against its new frame), slot 1 old "b"
    expect(show(result)).toEqual(["in 0", "text 0 #3", "out", "perm 0->1", "perm 1->0", "permEnd"]);
  });

  it("duplicate keys throw like Blazor, on the initial render and on updates", () => {
    const dup = (b: RenderTreeBuilder): void => {
      for (const text of ["a", "b"]) {
        b.openElement(0, "p");
        b.setKey(1);
        b.addContent(1, text);
        b.closeElement();
      }
    };
    expect(() => diff(null, dup)).toThrow("More than one sibling of element 'p' has the same key value, '1'. Key values must be unique.");
    expect(() => diff(dup, (b) => b.addContent(0, "x"))).toThrow(/same key value/);
    const dupComponents = (b: RenderTreeBuilder): void => {
      for (let i = 0; i < 2; i++) {
        b.openComponent(0, Child);
        b.setKey("k");
        b.closeComponent();
      }
    };
    expect(() => diff(null, dupComponents)).toThrow("More than one sibling of component 'Child' has the same key value, 'k'. Key values must be unique.");
  });

  it("equal keys under different parents are fine", () => {
    const build: Build = (b) => {
      for (const parent of ["x", "y"]) {
        b.openElement(0, "div");
        b.setKey(parent);
        b.openElement(1, "p");
        b.setKey(1);
        b.closeElement();
        b.closeElement();
      }
    };
    expect(() => diff(null, build)).not.toThrow();
  });
});

describe("computeDiff — attributes", () => {
  const element = (attrs: Array<[number, string, unknown]>): Build => (b) => {
    b.openElement(0, "div");
    for (const [seq, name, value] of attrs) b.addAttribute(seq, name, value as string);
    b.closeElement();
  };

  it("sets changed, added and removes dropped attributes", () => {
    expect(show(diff(element([[1, "a", "1"]]), element([[1, "a", "2"]])))).toEqual(["set 0 #1"]);
    expect(show(diff(element([[1, "a", "1"]]), element([[1, "a", "1"], [2, "b", "x"]])))).toEqual(["set 0 #2"]);
    expect(show(diff(element([[1, "a", "1"], [2, "b", "x"]]), element([[1, "a", "1"]])))).toEqual(["rmattr 0 b"]);
  });

  it("falls back to name matching when sequences or names diverge (splatting)", () => {
    const result = diff(element([[1, "b", "x"], [1, "a", "1"]]), element([[1, "a", "1"], [1, "c", "y"]]));
    expect(show(result)).toEqual(["rmattr 0 b", "set 0 #2"]);
  });

  it("an attribute moving to a lower sequence stays set", () => {
    const result = diff(element([[5, "class", "k"]]), element([[3, "class", "k"], [4, "id", "i"]]));
    expect(show(result)).toEqual(["set 0 #2"]);
  });
});

describe("DomRenderer — applying edits", () => {
  class Label extends ComponentBase {
    @Parameter() label = "";
    renders = 0;
    protected override shouldRender(): boolean {
      return this.renders === 0; // renders once: later parent renders do not refresh the content
    }
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      this.renders++;
      b.openElement(0, "i");
      b.addContent(1, this.label);
      b.closeElement();
      b.addMarkupContent(2, `<b>${this.label}</b>`);
    }
  }

  class Host extends ComponentBase {
    order = ["a", "b", "c"];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "div");
      for (const key of this.order) {
        b.openComponent(1, defineComponent(Label));
        b.setKey(key);
        b.addAttribute(2, "label", key);
        b.closeComponent();
      }
      b.closeElement();
    }
  }

  it("a keyed move carries the component's whole output, not just its markers", async () => {
    const container = document.createElement("div");
    const renderer = new Renderer();
    const state = renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("aabbcc");

    const host = state.component as Host;
    host.order = ["c", "a", "b"];
    componentInternals.requestRender(host);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("ccaabb");
  });

  it("removing an element drops the states of the components inside it", async () => {
    let show = true;
    class Toggle extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        if (!show) return;
        b.openElement(0, "div");
        b.openComponent(1, Child);
        b.closeComponent();
        b.closeElement();
      }
    }
    const container = document.createElement("div");
    const renderer = new Renderer();
    const state = renderer.renderInContainer(Toggle, container);
    await renderer.waitUntilIdle();
    const child = [...state.slotChildren.values()][0]!;
    expect(renderer.getComponentState(child.id)).toBe(child);

    show = false;
    componentInternals.requestRender(state.component);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("");
    expect(child.disposed).toBe(true);
    expect(renderer.getComponentState(child.id)).toBeUndefined();
  });

  it("a duplicate key fails the render and leaves the live tree intact", async () => {
    let dup = false;
    class Keys extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        for (const key of dup ? [1, 1] : [1, 2]) {
          b.openElement(0, "p");
          b.setKey(key);
          b.addContent(1, String(key));
          b.closeElement();
        }
      }
    }
    const container = document.createElement("div");
    const renderer = new Renderer();
    const state = renderer.renderInContainer(Keys, container);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("12");

    const errors: RenderError[] = [];
    renderer.errorHandler = (error) => errors.push(error);
    dup = true;
    componentInternals.requestRender(state.component);
    await renderer.waitUntilIdle();
    expect(errors.map((e) => [String(e.error), e.component, e.phase])).toEqual([
      [expect.stringMatching(/same key value/), state, "diff"],
    ]);
    expect(container.textContent).toBe("12");

    dup = false;
    componentInternals.requestRender(state.component);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("12");
  });
});

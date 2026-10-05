/**
 * Sections vs. Blazor (SectionRegistry / SectionContent / SectionOutlet).
 * Review: Sections, roadmap 3.4.
 *
 * Blazor semantics (SectionRegistry.cs): "last added wins", default content
 * loses, removing the last provider falls back to the previous one,
 * removing a non-last one does not notify, exactly one subscriber per
 * identifier.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  defineComponent,
  SectionContent,
  SectionOutlet,
  type RenderFragment,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { host, Probe, log, type Build } from "./host.js";
import { mount } from "../harness.js";

/** Renders <p>{text}</p> (the content a provider supplies). */
const p = (text: string): RenderFragment => (b: RenderTreeBuilder) => {
  b.openElement(0, "p");
  b.addContent(1, text);
  b.closeElement();
};

const providerBuild = (text: string, extra: Record<string, unknown> = {}, seq = 0): Build => (b) => {
  b.openComponent(seq, defineComponent(SectionContent));
  b.addAttribute(seq + 1, "sectionName", "s");
  b.addAttribute(seq + 2, "childContent", p(text));
  for (const [name, value] of Object.entries(extra)) b.addAttribute(seq + 3, name, value as never);
  b.closeComponent();
};

const outletBuild = (identifier = "s", seq = 100): Build => (b) => {
  b.openComponent(seq, defineComponent(SectionOutlet));
  b.addAttribute(seq + 1, "sectionName", identifier);
  b.closeComponent();
};

describe("SectionRegistry/SectionContent/SectionOutlet (3.4)", () => {
  beforeEach(() => {
    log.splice(0);
  });

  it("renders the content of the matching SectionContent", async () => {
    const h = await host((b) => {
      providerBuild("toolbox")(b);
      outletBuild()(b);
    });
    expect(h.text()).toBe("toolbox");
  });

  it("an outlet without a provider renders nothing", async () => {
    const h = await host((b) => {
      outletBuild()(b);
    });
    expect(h.text()).toBe("");
  });

  it("a content change re-renders the outlet", async () => {
    const h = await host((b) => {
      providerBuild("one")(b);
      outletBuild()(b);
    });
    await h.update((b) => {
      providerBuild("two")(b);
      outletBuild()(b);
    });
    expect(h.text()).toBe("two");
  });

  it("the most recently added provider wins", async () => {
    const h = await host((b) => {
      providerBuild("first", {}, 0)(b);
      providerBuild("second", {}, 10)(b);
      outletBuild()(b);
    });
    expect(h.text()).toBe("second");
  });

  it("removing the last provider falls back to the previous one; removing a non-last provider changes nothing", async () => {
    const withProviders =
      (...texts: string[]): Build =>
      (b) => {
        b.openComponent(0, defineComponent(SectionOutlet));
        b.addAttribute(1, "sectionName", "s");
        b.closeComponent();
        texts.forEach((text, index) => {
          providerBuild(text, {}, 10 + index * 10)(b);
        });
      };
    const h = await host(withProviders("alpha", "beta", "gamma"));
    expect(h.text()).toBe("gamma");
    // gamma removed → the content falls back to beta.
    await h.update(withProviders("alpha", "beta"));
    expect(h.text()).toBe("beta");
    // gamma added back → wins again.
    await h.update(withProviders("alpha", "beta", "gamma"));
    expect(h.text()).toBe("gamma");
    // alpha removed: not the last provider → no notification, content unchanged.
    await h.update(withProviders("beta", "gamma"));
    expect(h.text()).toBe("gamma");
  });

  it("default content yields to a later provider and its removal, and notifies while it is the last one", async () => {
    // HeadOutlet-style: the default content is registered first, a normal
    // provider comes and goes.
    const withDefault =
      (normal: string | null, fallback: string): Build =>
      (b) => {
        b.openComponent(0, defineComponent(SectionContent));
        b.addAttribute(1, "sectionName", "s");
        b.addAttribute(2, "isDefaultContent", true);
        b.addAttribute(3, "childContent", p(fallback));
        b.closeComponent();
        if (normal !== null) {
          b.openComponent(4, defineComponent(SectionContent));
          b.addAttribute(5, "sectionName", "s");
          b.addAttribute(6, "childContent", p(normal));
          b.closeComponent();
        }
        b.openComponent(7, defineComponent(SectionOutlet));
        b.addAttribute(8, "sectionName", "s");
        b.closeComponent();
      };
    const h = await host(withDefault("real", "fallback-v1"));
    expect(h.text()).toBe("real");
    // The normal provider is removed: the default content becomes visible.
    await h.update(withDefault(null, "fallback-v1"));
    expect(h.text()).toBe("fallback-v1");
    // Alone, the default provider IS the last one — its changes notify.
    await h.update(withDefault(null, "fallback-v2"));
    expect(h.text()).toBe("fallback-v2");
  });

  it("default content loses to a normal provider even when added last", async () => {
    const h = await host((b) => {
      b.openComponent(0, defineComponent(SectionContent));
      b.addAttribute(1, "sectionName", "s");
      b.addAttribute(2, "childContent", p("real"));
      b.closeComponent();
      b.openComponent(3, defineComponent(SectionContent));
      b.addAttribute(4, "sectionName", "s");
      b.addAttribute(5, "isDefaultContent", true);
      b.addAttribute(6, "childContent", p("fallback"));
      b.closeComponent();
      b.openComponent(7, defineComponent(SectionOutlet));
      b.addAttribute(8, "sectionName", "s");
      b.closeComponent();
    });
    expect(h.text()).toBe("real");
  });

  it("a second subscriber throws", async () => {
    const twoOutlets: Build = (b) => {
      b.openComponent(0, defineComponent(SectionOutlet));
      b.addAttribute(1, "sectionName", "dup");
      b.closeComponent();
      b.openComponent(2, defineComponent(SectionOutlet));
      b.addAttribute(3, "sectionName", "dup");
      b.closeComponent();
    };
    await expect(host(twoOutlets)).rejects.toThrow(
      "There is already a subscriber to the content with the given section ID 'dup'.",
    );
  });

  it("rejects both identifiers set, and no identifier (outlet and content)", async () => {
    const both: Build = (b) => {
      b.openComponent(0, defineComponent(SectionOutlet));
      b.addAttribute(1, "sectionName", "a");
      b.addAttribute(2, "sectionId", "b");
      b.closeComponent();
    };
    await expect(host(both)).rejects.toThrow(
      "SectionOutlet requires that 'SectionName' and 'SectionId' cannot both have non-null values.",
    );
    const none: Build = (b) => {
      b.openComponent(0, defineComponent(SectionOutlet));
      b.closeComponent();
    };
    await expect(host(none)).rejects.toThrow(
      "SectionOutlet requires a non-null value either for 'SectionName' or 'SectionId'.",
    );
    const contentNone: Build = (b) => {
      b.openComponent(0, defineComponent(SectionContent));
      b.closeComponent();
    };
    await expect(host(contentNone)).rejects.toThrow(
      "SectionContent requires a non-null value either for 'SectionName' or 'SectionId'.",
    );
  });

  it("a content change of a non-last provider does not notify the outlet", async () => {
    // Provider A's content is a Probe; B (last) wins. B's fragment object is
    // held stable across builds — only A's fragment changes.
    const probeFrag =
      (id: string): RenderFragment =>
      (b: RenderTreeBuilder) => {
        b.openComponent(0, defineComponent(Probe));
        b.addAttribute(1, "label", id);
        b.closeComponent();
      };
    const fragB = probeFrag("b");
    const build =
      (fragmentA: RenderFragment): Build =>
      (b) => {
        b.openComponent(0, defineComponent(SectionContent));
        b.addAttribute(1, "sectionName", "s");
        b.addAttribute(2, "childContent", fragmentA);
        b.closeComponent();
        b.openComponent(3, defineComponent(SectionContent));
        b.addAttribute(4, "sectionName", "s");
        b.addAttribute(5, "childContent", fragB);
        b.closeComponent();
        b.openComponent(6, defineComponent(SectionOutlet));
        b.addAttribute(7, "sectionName", "s");
        b.closeComponent();
      };
    const h = await host(build(probeFrag("a")));
    const bRenders = log.filter((entry) => entry === "init:b" || entry === "render:b");
    expect(bRenders).toEqual(["init:b", "render:b"]);
    // A's fragment changes → A re-registers and notifies — but A is not the
    // last provider, so the outlet stays untouched.
    await h.update(build(probeFrag("a2")));
    expect(log.filter((entry) => entry === "init:b" || entry === "render:b")).toEqual(bRenders);
  });

  it("switching providers rebuilds the inner renderer; unchanged content keeps it (object-key rationale)", async () => {
    const probeFrag =
      (id: string): RenderFragment =>
      (b: RenderTreeBuilder) => {
        b.openComponent(0, defineComponent(Probe));
        b.addAttribute(1, "label", id);
        b.closeComponent();
      };
    const fragA = probeFrag("a");
    const fragB = probeFrag("b");
    const build =
      (fragment: RenderFragment): Build =>
      (b) => {
        b.openComponent(0, defineComponent(SectionContent));
        b.addAttribute(1, "sectionName", "s");
        b.addAttribute(2, "childContent", fragment);
        b.closeComponent();
        b.openComponent(3, defineComponent(SectionOutlet));
        b.addAttribute(4, "sectionName", "s");
        b.closeComponent();
      };
    const h = await host(build(fragA));
    expect(log).toContain("init:a");
    // Same fragment object (provider unchanged, unrelated state change... the
    // content attribute is identical) → no rebuild of A's instance.
    log.splice(0);
    await h.update(build(fragA));
    expect(log.filter((entry) => entry.startsWith("init:"))).toEqual([]);
    // A different fragment replaces the keyed renderer → a fresh instance of B.
    await h.update(build(fragB));
    expect(log).toContain("dispose:a");
    expect(log).toContain("init:b");
    // Back to the original fragment: the renderer is replaced again (the key
    // differs from B's), a fresh instance of A.
    await h.update(build(fragA));
    expect(log).toContain("dispose:b");
    expect(log).toContain("init:a");
  });

  it("disposal unsubscribes: a new outlet may subscribe to the same identifier", async () => {
    const withOutlet =
      (present: boolean): Build =>
      (b) => {
        b.openComponent(0, defineComponent(SectionContent));
        b.addAttribute(1, "sectionName", "s");
        b.addAttribute(2, "childContent", p("content"));
        b.closeComponent();
        if (present) {
          b.openComponent(3, defineComponent(SectionOutlet));
          b.addAttribute(4, "sectionName", "s");
          b.closeComponent();
        }
      };
    const h = await host(withOutlet(true));
    expect(h.text()).toBe("content");
    await h.update(withOutlet(false));
    await h.update(withOutlet(true));
    expect(h.text()).toBe("content");
  });
});

describe("Sections in markup (3.4)", () => {
  it("<SectionContent> feeds <SectionOutlet>", async () => {
    const m = await mount(
      `<SectionContent SectionName="sidebar"><p class="side">Side</p></SectionContent>
<SectionOutlet SectionName="sidebar" />`,
    );
    expect(m.container.querySelector(".side")?.textContent).toBe("Side");
  });

  it("a markup outlet without an identifier fails at runtime", async () => {
    await expect(mount(`<SectionOutlet />`)).rejects.toThrow(
      "requires a non-null value either for 'SectionName' or 'SectionId'",
    );
  });
});
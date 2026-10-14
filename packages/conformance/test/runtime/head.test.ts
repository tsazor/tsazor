/**
 * HeadOutlet/HeadContent/PageTitle vs. Blazor (src/Components/Web/src/Head).
 * Roadmap 3.4: the runtime mounts a HeadOutlet root in document.head (Blazor's
 * WebAssembly host parity), the static <title> is captured and removed on the
 * first render (Blazor's JS getAndRemoveExistingTitle), PageTitle is a
 * SectionContent under HeadOutlet.TitleSectionId.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ComponentBase,
  defineComponent,
  HeadOutlet,
  PageTitle,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { settle as settleRenderer, type Build } from "./host.js";
import { compileFiles, createTestRenderer } from "../harness.js";
import { rendererOf } from "@tsazor/runtime/internal";

/** Root whose render tree is a plain build function (test-local Host). */
class Root extends ComponentBase {
  build: Build = () => {};
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.build(b);
  }
  rerender(): void {
    this.stateHasChanged();
  }
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

/** Mounts a HeadOutlet root in document.head plus a build-function root in the body, one renderer. */
async function withHead(build: Build) {
  const renderer = createTestRenderer();
  renderHead(renderer);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = renderer.renderInContainer(Root, container);
  const root = state.component as Root;
  const update = async (next?: Build): Promise<void> => {
    if (next) root.build = next;
    root.rerender();
    await settleRenderer(renderer);
  };
  await update(build);
  return {
    renderer,
    container,
    update,
    dispose: () => {
      renderer.disposeComponent(state);
      container.remove();
    },
  };
}

function renderHead(renderer: ReturnType<typeof createTestRenderer>): void {
  renderer.renderInContainer(HeadOutlet, document.head);
}

/** Mounts a compiled markup page via the same head-root pattern. */
async function withHeadMarkup(source: string) {
  const compiled = await compileFiles({ "Test.tsazor": source });
  const { default: Page } = await import(/* @vite-ignore */ compiled.modules["Test.tsazor"]!);
  const renderer = createTestRenderer();
  renderHead(renderer);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = renderer.renderInContainer(Page as never, container);
  await settleRenderer(renderer);
  const page = state.component as unknown as Record<string, unknown> & { stateHasChanged(): void };
  const rerender = async (): Promise<void> => {
    page.stateHasChanged();
    await settleRenderer(renderer);
  };
  return { container, page, rerender };
}

describe("HeadOutlet/HeadContent (3.4)", () => {
  it("a markup <HeadContent> lands in the document head, not in place", async () => {
    const { container } = await withHeadMarkup(`<HeadContent><meta name="a" content="b" /></HeadContent>`);
    expect(document.head.querySelector('meta[name="a"]')).not.toBeNull();
    // SectionContent renders nothing at its own place — the head root's outlet displays it.
    expect(container.querySelector("meta")).toBeNull();
  });

  it("markup <PageTitle> and <HeadContent> both work through the head root", async () => {
    await withHeadMarkup(`<PageTitle>Doc</PageTitle>
<HeadContent><meta name="x" content="1" /></HeadContent>`);
    expect(document.title).toBe("Doc");
    expect(document.head.querySelector('meta[name="x"]')).not.toBeNull();
  });

  it("re-rendering a page keeps its head elements and updates them in place (C#: an equal delegate keeps the outlet's content)", async () => {
    const { page, rerender } = await withHeadMarkup(`<PageTitle>@title</PageTitle>
<HeadContent><link rel="stylesheet" href="a.css" /><meta name="t" content="@title" /></HeadContent>
@code { title = "One"; }`);
    const title = document.head.querySelector("title");
    const link = document.head.querySelector("link");
    page.title = "Two";
    await rerender();
    expect(document.title).toBe("Two");
    expect(document.head.querySelector("title")).toBe(title);
    expect(document.head.querySelector("link")).toBe(link);
    expect(document.head.querySelector('meta[name="t"]')?.getAttribute("content")).toBe("Two");
  });

  it("HeadOutlet captures and removes the static title as default content; PageTitle replaces it; removal restores it", async () => {
    const staticTitle = document.createElement("title");
    staticTitle.textContent = "Static";
    document.head.appendChild(staticTitle);
    const ctx = await withHead(() => {});
    // Captured, removed, and re-rendered as the title section's default content.
    expect(document.title).toBe("Static");
    expect(document.head.querySelectorAll("title")).toHaveLength(1);

    await ctx.update((b) => {
      b.openComponent(0, defineComponent(PageTitle));
      b.addAttribute(1, "childContent", (bb: RenderTreeBuilder) => bb.addContent(0, "Dynamic"));
      b.closeComponent();
    });
    expect(document.title).toBe("Dynamic");

    // The PageTitle provider is removed: the default title falls back in.
    await ctx.update(() => {});
    expect(document.title).toBe("Static");
  });

  it("createTsazorApp mounts the head root; <PageTitle> drives the title; dispose removes it", async () => {
    const compiled = await compileFiles({ "Test.tsazor": `<PageTitle>App Title</PageTitle>
<p>body</p>` });
    const { default: App } = await import(/* @vite-ignore */ compiled.modules["Test.tsazor"]!);
    const appDiv = document.createElement("div");
    appDiv.id = "app";
    document.body.appendChild(appDiv);
    const { createTsazorApp } = await import("@tsazor/runtime");
    const app = createTsazorApp({ root: App as never, selector: "#app" });
    await settleRenderer(rendererOf(app));

    expect(appDiv.textContent).toContain("body");
    expect(document.title).toBe("App Title");
    expect(document.head.querySelectorAll("title")).toHaveLength(1);

    app.dispose();
    expect(document.head.querySelectorAll("title")).toHaveLength(0);
    expect(appDiv.innerHTML).toBe("");
  });
});
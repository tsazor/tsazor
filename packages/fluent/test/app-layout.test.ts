/**
 * AppLayout (MudBlazor's MudLayout + MudAppBar + MudDrawer + MudMainContent): the landmarks, the navigation column
 * shown and hidden through @bind-navOpen, and the narrow window, where the column starts closed and Escape or a
 * click on the content closes it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { AppLayout } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  vi.unstubAllGlobals();
  Shell.withNav = true;
  document.body.innerHTML = "";
});

/** The window's width as the layout's media query sees it. */
function windowWidth(width: number): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width") && width < 960, media: query }));
}

/** A window whose width changes: the returned function resizes it and tells the queries whose answer changed. */
function resizableWindow(width: number): { resize: (next: number) => void; listeners: () => number } {
  let current = width;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("max-width") && current < 960;
    },
    media: query,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void, options?: { signal?: AbortSignal }) => {
      listeners.add(listener);
      options?.signal?.addEventListener("abort", () => listeners.delete(listener));
    },
  }));
  return {
    resize(next) {
      const crossed = (current < 960) !== (next < 960);
      current = next;
      if (crossed) for (const listener of listeners) listener({ matches: next < 960 });
    },
    listeners: () => listeners.size,
  };
}

class Shell extends ComponentBase {
  static last: Shell | undefined;
  static withNav = true;
  open = true;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    Shell.last = this;
    b.openComponent(0, AppLayout);
    b.addAttribute(1, "navOpen", this.open);
    b.addAttribute(2, "navOpenChanged", EventCallback.bind(this, (next: boolean) => {
      this.open = next;
    }));
    b.addAttribute(3, "header", (inner: RenderTreeBuilder) => inner.addContent(0, "Blazor Hero"));
    if (Shell.withNav) b.addAttribute(4, "nav", (inner: RenderTreeBuilder) => {
      inner.openElement(0, "nav");
      inner.addAttribute(1, "aria-label", "Main");
      inner.addContent(2, "Home");
      inner.closeElement();
    });
    b.addAttribute(5, "childContent", (inner: RenderTreeBuilder) => {
      inner.openElement(0, "h1");
      inner.addContent(1, "Dashboard");
      inner.closeElement();
    });
    b.closeComponent();
  }
}

async function mount(): Promise<RenderResult> {
  const result = await render(Shell);
  mounted.push(result);
  await result.settle();
  return result;
}

const column = (container: Element) => container.querySelector<HTMLElement>("main")!.previousElementSibling as HTMLElement;

describe("AppLayout", () => {
  it("renders the header bar, the navigation column and the page as banner, column and main", async () => {
    windowWidth(1400);
    const { container } = await mount();
    const root = container.firstElementChild!;
    expect([...root.children].map((child) => child.tagName.toLowerCase())).toEqual(["header", "div", "main"]);
    expect(root.querySelector("header")!.textContent).toBe("Blazor Hero");
    expect(column(container).querySelector("nav[aria-label=Main]")).not.toBeNull();
    expect(container.querySelector("main h1")!.textContent).toBe("Dashboard");
    expect(column(container).hidden).toBe(false);
  });

  it("hides and shows the column with navOpen; a click on the page keeps it in a wide window", async () => {
    windowWidth(1400);
    const { container, ...renderer } = await mount();
    Shell.last!.open = false;
    Shell.last!.stateHasChanged();
    await renderer.settle();
    expect(column(container).hidden).toBe(true);

    Shell.last!.open = true;
    Shell.last!.stateHasChanged();
    await renderer.settle();
    container.querySelector("main")!.click();
    await renderer.settle();
    expect(column(container).hidden).toBe(false);
    expect(Shell.last!.open).toBe(true);
  });

  it("starts closed in a narrow window and tells the parent; opened there, Escape and a click on the page close it", async () => {
    windowWidth(600);
    const { container, ...renderer } = await mount();
    expect(Shell.last!.open).toBe(false);
    expect(column(container).hidden).toBe(true);

    for (const close of [
      () => container.firstElementChild!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      () => container.querySelector("main")!.click(),
    ]) {
      Shell.last!.open = true;
      Shell.last!.stateHasChanged();
      await renderer.settle();
      expect(column(container).hidden).toBe(false);
      close();
      await renderer.settle();
      expect(column(container).hidden).toBe(true);
      expect(Shell.last!.open).toBe(false);
    }
  });

  it("follows the window past the breakpoint: narrower closes the column, wider opens it again (MudBlazor's responsive drawer)", async () => {
    const viewport = resizableWindow(1400);
    const result = await mount();
    const { container, ...renderer } = result;
    expect(column(container).hidden).toBe(false);
    viewport.resize(800);
    await renderer.settle();
    expect([column(container).hidden, Shell.last!.open]).toEqual([true, false]);
    viewport.resize(1400);
    await renderer.settle();
    expect([column(container).hidden, Shell.last!.open]).toEqual([false, true]);
    viewport.resize(1200);
    await renderer.settle();
    expect(column(container).hidden).toBe(false);
    result.dispose();
    mounted.splice(mounted.indexOf(result), 1);
    expect(viewport.listeners()).toBe(0);
  });

  it("without a nav it is the header over the page: no column, and a narrow window changes nothing", async () => {
    windowWidth(600);
    Shell.withNav = false;
    const { container } = await mount();
    expect([...container.firstElementChild!.children].map((child) => child.tagName.toLowerCase())).toEqual(["header", "main"]);
    expect(Shell.last!.open).toBe(true);
  });
});

/**
 * M6 acceptance tests: Data — Virtualize (spacer strategy over 10k items,
 * ItemsProvider window) and TsazorHttp (getJson/postJson + interceptors).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComponentBase,
  Renderer,
  TsazorHttp,
  TsazorHttpError,
  Virtualize,
  defineComponent,
  type RenderTreeBuilder,
  type VirtualizeItemsProviderResult,
} from "../src/index";

class VirtualizePage extends ComponentBase {
  items = Array.from({ length: 10_000 }, (_, i) => `Item ${i}`);

  protected override onInitialized(): void {
    currentInstance = this;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(Virtualize));
    b.addAttribute(1, "ItemSize", 50);
    b.addAttribute(2, "Overscan", 2);
    b.addAttribute(3, "Items", this.items);
    b.addAttribute(4, "ItemTemplate", (item: unknown) => {
      return (inner: RenderTreeBuilder) => {
        inner.openElement(0, "div");
        inner.addAttribute(1, "class", "virtualize-item");
        inner.addContent(2, String(item));
        inner.closeElement();
      };
    });
    b.closeComponent();
  }
}

class ProviderPage extends ComponentBase {
  providerCalls: Array<{ startIndex: number; count: number }> = [];

  protected override onInitialized(): void {
    currentInstance = this;
  }

  itemsProvider = async (request: { startIndex: number; count: number }): Promise<VirtualizeItemsProviderResult<string>> => {
    this.providerCalls.push({ ...request });
    return {
      items: Array.from({ length: request.count }, (_, i) => `P${request.startIndex + i}`),
      totalItemCount: 1_000,
    };
  };

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(Virtualize));
    b.addAttribute(1, "ItemSize", 50);
    b.addAttribute(2, "Overscan", 2);
    b.addAttribute(3, "ItemsProvider", this.itemsProvider);
    b.addAttribute(4, "ItemTemplate", (item: unknown) => {
      return (inner: RenderTreeBuilder) => {
        inner.openElement(0, "div");
        inner.addAttribute(1, "class", "virtualize-item");
        inner.addContent(2, String(item));
        inner.closeElement();
      };
    });
    b.closeComponent();
  }
}

let currentInstance: VirtualizePage | ProviderPage | null = null;

/** Mounts `page` in a scrolling panel of `height` px; `scrollTo(px)` scrolls the list by `px`. */
async function mountInPanel(page: new () => ComponentBase, height: number) {
  const host = document.createElement("div");
  host.style.overflowY = "auto";
  document.body.appendChild(host);
  Object.defineProperty(host, "clientHeight", { value: height, configurable: true });
  Object.defineProperty(host, "scrollHeight", { value: 500_000, configurable: true });
  const renderer = new Renderer();
  renderer.renderInContainer(page, host);
  await renderer.waitUntilIdle();
  const rect = (top: number) => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} }) as DOMRect;
  host.getBoundingClientRect = () => rect(0);
  const scrollTo = async (px: number) => {
    // The list starts at its top spacer: scrolled by `px`, it sits `px` above the panel's top.
    (host.querySelector(".virtualize-spacer") as HTMLElement).getBoundingClientRect = () => rect(-px);
    host.dispatchEvent(new Event("scroll"));
    await renderer.waitUntilIdle();
  };
  return { host, renderer, scrollTo };
}

describe("Virtualize", () => {
  it("renders only the visible window of 10k items with correct spacer geometry", async () => {
    const { renderer, container } = await mount(VirtualizePage);
    const page = currentInstance as VirtualizePage;

    // No scrolling container: the window is the viewport (happy-dom: 768 px) = 16 rows + 4 overscan.
    const items = [...container.querySelectorAll(".virtualize-item")];
    expect(items.length).toBe(20);
    expect(items[0]?.textContent).toBe("Item 0");
    expect(items[items.length - 1]?.textContent).toBe("Item 19");
    expect(page.items.length).toBe(10_000);

    const spacers = [...container.querySelectorAll(".virtualize-spacer")] as HTMLElement[];
    expect(spacers[0]?.style.height).toBe("0px");
    const renderedCount = items.length;
    expect(spacers[1]?.style.height).toBe(`${(10_000 - renderedCount) * 50}px`);
    void renderer;
  });

  it("renders no element of its own: spacers and items sit in the parent (Blazor)", async () => {
    const { container } = await mount(VirtualizePage);
    const children = [...container.children];
    expect(children[0]!.className).toBe("virtualize-spacer");
    expect(children[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(children[1]!.className).toBe("virtualize-item");
    expect(children.at(-1)!.className).toBe("virtualize-spacer");
  });

  it("measures against a scrolling ancestor and shifts the window when it scrolls", async () => {
    const { host, scrollTo } = await mountInPanel(VirtualizePage, 400);
    await scrollTo(5_000); // row 100
    const items = [...host.querySelectorAll(".virtualize-item")].map((el) => el.textContent);
    // 400 px = 8 rows, plus 2 × 2 overscan; startIndex = 100 - overscan(2) = 98.
    expect(items[0]).toBe("Item 98");
    expect(items.length).toBe(12);
    const spacers = [...host.querySelectorAll(".virtualize-spacer")] as HTMLElement[];
    expect(spacers[0]?.style.height).toBe("4900px"); // 98 * 50
    host.remove();
  });

  it("requests windows from the items provider and updates on scroll", async () => {
    const { renderer, container } = await mount(ProviderPage);
    const page = currentInstance as ProviderPage;

    // Initial load: the window as viewport (happy-dom: 768 px) → 16 visible + 2*2 overscan.
    await renderer.waitUntilIdle();
    expect(page.providerCalls.length).toBeGreaterThan(0);
    expect(page.providerCalls[0]).toEqual({ startIndex: 0, count: 20 });
    const items = [...container.querySelectorAll(".virtualize-item")].map((el) => el.textContent);
    expect(items[0]).toBe("P0");
    expect(items.length).toBe(20);
  });

  it("requests the scrolled-to window from the items provider", async () => {
    const { host, scrollTo } = await mountInPanel(ProviderPage, 400);
    const page = currentInstance as ProviderPage;
    await scrollTo(10_000); // row 200
    const last = page.providerCalls[page.providerCalls.length - 1]!;
    expect(last).toEqual({ startIndex: 198, count: 12 });
    const items = [...host.querySelectorAll(".virtualize-item")].map((el) => el.textContent);
    expect(items[0]).toBe("P198");
    const spacers = [...host.querySelectorAll(".virtualize-spacer")] as HTMLElement[];
    expect(spacers[0]?.style.height).toBe("9900px");
    expect(spacers[1]?.style.height).toBe(`${(1000 - 210) * 50}px`);
    host.remove();
  });

  it("renders the spacers as the given element (a tr inside a tbody)", async () => {
    class TablePage extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openElement(0, "table");
        b.openElement(1, "tbody");
        b.openComponent(2, defineComponent(Virtualize));
        b.addAttribute(3, "Items", ["a", "b"]);
        b.addAttribute(4, "SpacerElement", "tr");
        b.addAttribute(5, "ItemTemplate", (item: unknown) => (inner: RenderTreeBuilder) => {
          inner.openElement(0, "tr");
          inner.openElement(1, "td");
          inner.addContent(2, String(item));
          inner.closeElement();
          inner.closeElement();
        });
        b.closeComponent();
        b.closeElement();
        b.closeElement();
      }
    }
    const { container } = await mount(TablePage);
    const rows = [...container.querySelectorAll("tbody > tr")];
    expect(rows.map((row) => row.className || row.textContent)).toEqual(["virtualize-spacer", "a", "b", "virtualize-spacer"]);
  });
});

/* TsazorHttp ------------------------------------------------------------- */

describe("TsazorHttp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("performs getJson with baseUrl resolution and parses the response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 7, name: "Tsazor" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const http = new TsazorHttp({ baseUrl: "https://api.example.com/v1" });
    const result = await http.getJson<{ id: number; name: string }>("/items/7");

    expect(result).toEqual({ id: 7, name: "Tsazor" });
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.url).toBe("https://api.example.com/v1/items/7");
    expect(request.method).toBe("GET");
    expect(request.headers.get("content-type")).toBe("application/json");
  });

  it("posts JSON bodies", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ created: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const http = new TsazorHttp();
    const result = await http.postJson<{ created: boolean }>("/items", { name: "x" });

    expect(result).toEqual({ created: true });
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.method).toBe("POST");
    expect(await request.json()).toEqual({ name: "x" });
  });

  it("runs request and response interceptors in order", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([1, 2]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const http = new TsazorHttp();
    const seenAuth: string[] = [];
    http.addRequestInterceptor((request) => {
      return new Request(request, { headers: { authorization: "Bearer t1" } });
    });
    http.addRequestInterceptor((request) => {
      seenAuth.push(request.headers.get("authorization")!);
      return request;
    });
    http.addResponseInterceptor((response) => new Response(response.body, { status: response.status, headers: { "x-touched": "yes" } }));

    const result = await http.getJson<number[]>("/numbers");
    expect(result).toEqual([1, 2]);
    expect(seenAuth).toEqual(["Bearer t1"]);
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.headers.get("authorization")).toBe("Bearer t1");
  });

  it("sends through the fetch option instead of the global fetch (HttpClient's handler)", async () => {
    const globalFetch = vi.fn(async () => new Response("global"));
    vi.stubGlobal("fetch", globalFetch);
    const seen: string[] = [];
    const http = new TsazorHttp({
      baseUrl: "https://bakery.example",
      fetch: async (request) => {
        seen.push(`${request.method} ${request.url} ${request.headers.get("authorization")}`);
        return new Response(JSON.stringify(["rye"]), { status: 200 });
      },
    });
    http.addRequestInterceptor((request) => new Request(request, { headers: { authorization: "Bearer t" } }));

    expect(await http.getJson<string[]>("/api/breads")).toEqual(["rye"]);
    expect(seen).toEqual(["GET https://bakery.example/api/breads Bearer t"]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("throws TsazorHttpError with status and readable body on error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ title: "Not found", status: 404 }), { status: 404 })),
    );
    const http = new TsazorHttp();
    const error = await http.getJson("/missing").catch((e: TsazorHttpError) => e);
    expect(error).toBeInstanceOf(TsazorHttpError);
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ title: "Not found", status: 404 });
    expect(error.message).toContain("[tsazor-http] 404");
  });

  it("falls back to raw body text when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const http = new TsazorHttp();
    const error = await http.getJson("/missing").catch((e: TsazorHttpError) => e);
    expect(error.body).toBe("not found");
  });

  it("keeps send() non-throwing on error responses (result plumbing for @tsazor/dotnet)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const http = new TsazorHttp();
    const response = await http.send(new Request("https://api.example.com/x"));
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("boom");
  });
});

/* Helpers --------------------------------------------------------------- */

async function mount(pageClass: abstract new () => ComponentBase): Promise<{ renderer: Renderer; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  renderer.renderInContainer(pageClass, container);
  await renderer.waitUntilIdle();
  return { renderer, container };
}

afterEach(() => {
  document.body.innerHTML = "";
});
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

describe("Virtualize", () => {
  it("renders only the visible window of 10k items with correct spacer geometry", async () => {
    const { renderer, container } = await mount(VirtualizePage);
    const page = currentInstance as VirtualizePage;

    const wrapper = container.querySelector(".virtualize") as HTMLElement;
    // No measurable viewport in happy-dom → 600px fallback = 12 rows + 4 overscan.
    const items = [...container.querySelectorAll(".virtualize-item")];
    expect(items.length).toBeLessThanOrEqual(20);
    expect(items[0]?.textContent).toBe("Item 0");
    expect(items[items.length - 1]?.textContent).toBe("Item 15");
    expect(page.items.length).toBe(10_000);

    const spacers = [...container.querySelectorAll(".virtualize-spacer")] as HTMLElement[];
    expect(spacers[0]?.style.height).toBe("0px");
    const renderedCount = items.length;
    expect(spacers[1]?.style.height).toBe(`${(10_000 - renderedCount) * 50}px`);
    void renderer;
  });

  it("shifts the window when the host scrolls", async () => {
    const { renderer, container } = await mount(VirtualizePage);

    const wrapper = container.querySelector(".virtualize") as HTMLElement;
    Object.defineProperty(wrapper, "clientHeight", { value: 500, configurable: true });
    wrapper.scrollTop = 5_000; // row 100
    wrapper.dispatchEvent(new Event("scroll"));
    await renderer.waitUntilIdle();

    const items = [...container.querySelectorAll(".virtualize-item")].map((el) => el.textContent);
    // startIndex = 100 - overscan(2) = 98
    expect(items[0]).toBe("Item 98");
    const spacers = [...container.querySelectorAll(".virtualize-spacer")] as HTMLElement[];
    expect(spacers[0]?.style.height).toBe("4900px"); // 98 * 50
  });

  it("requests windows from the items provider and updates on scroll", async () => {
    const { renderer, container } = await mount(ProviderPage);
    const page = currentInstance as ProviderPage;

    // Initial load: fallback viewport 600px → 12 visible + 2*2 overscan.
    await renderer.waitUntilIdle();
    expect(page.providerCalls.length).toBeGreaterThan(0);
    expect(page.providerCalls[0]).toEqual({ startIndex: 0, count: 16 });

    let items = [...container.querySelectorAll(".virtualize-item")].map((el) => el.textContent);
    expect(items[0]).toBe("P0");
    expect(items.length).toBe(16);

    const wrapper = container.querySelector(".virtualize") as HTMLElement;
    Object.defineProperty(wrapper, "clientHeight", { value: 400, configurable: true });
    wrapper.scrollTop = 10_000; // row 200
    wrapper.dispatchEvent(new Event("scroll"));
    await renderer.waitUntilIdle();

    const last = page.providerCalls[page.providerCalls.length - 1]!;
    expect(last).toEqual({ startIndex: 198, count: 12 });
    items = [...container.querySelectorAll(".virtualize-item")].map((el) => el.textContent);
    expect(items[0]).toBe("P198");
    const spacers = [...container.querySelectorAll(".virtualize-spacer")] as HTMLElement[];
    expect(spacers[0]?.style.height).toBe("9900px");
    expect(spacers[1]?.style.height).toBe(`${(1000 - 210) * 50}px`);
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
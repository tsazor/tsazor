/**
 * The skin's own texts are library texts (B29): English by default, the app's `tsazor.ui.*` table entries in their
 * culture, re-rendered when the culture changes; a text parameter still wins.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { CultureService, StringLocalizer, type RenderFragment, type RenderTreeBuilder } from "@tsazor/runtime";
import { DataGrid, DatePicker, PaginationState, Paginator, PropertyColumn } from "../dist/index.js";

type Renderer = Pick<Awaited<ReturnType<typeof renderTree>>, "settle">;
async function settle(renderer: Renderer): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await renderer.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const orders = [{ customer: "Marta" }, { customer: "Jonas" }, { customer: "Lena" }, { customer: "Ali" }];

const GERMAN = {
  "tsazor.ui.paginator.page": "Seite {page} von {pages}",
  "tsazor.ui.paginator.items.one": "{count} Eintrag",
  "tsazor.ui.paginator.items.other": "{count} Einträge",
  "tsazor.ui.paginator.label": "Seiten",
  "tsazor.ui.pagination.next": "Nächste Seite",
};

async function mount(paginator: Record<string, unknown> = {}) {
  const culture = new CultureService("en-US");
  const localizer = new StringLocalizer({ culture, defaultCulture: "en", tables: { de: GERMAN } });
  const pagination = new PaginationState();
  pagination.itemsPerPage = 3;
  const mounted = await renderTree(
    (b) => {
      b.openComponent(0, DataGrid);
      b.addAttribute(1, "items", orders);
      b.addAttribute(2, "pagination", pagination);
      b.addAttribute(3, "childContent", ((inner: RenderTreeBuilder) => {
        inner.openComponent(0, PropertyColumn);
        inner.addAttribute(1, "property", (order: { customer: string }) => order.customer);
        inner.closeComponent();
      }) as RenderFragment);
      b.closeComponent();
      b.openComponent(10, Paginator);
      b.addAttribute(11, "state", pagination);
      let seq = 12;
      for (const [name, value] of Object.entries(paginator)) b.addAttribute(seq++, name, value);
      b.closeComponent();
    },
    {
      services: (services) => {
        services.registerValue(CultureService as never, culture);
        services.registerValue(StringLocalizer as never, localizer);
      },
    },
  );
  await mounted.settle();
  const nav = () => mounted.container.querySelector("nav")!;
  return { ...mounted, culture, nav };
}

describe("library texts in the skin", () => {
  it("are English by default and follow the culture into the app's table", async () => {
    const { culture, nav, ...renderer } = await mount();
    expect(nav().getAttribute("aria-label")).toBe("Pages");
    expect(nav().textContent).toContain("Page 1 of 2");
    expect(nav().textContent).toContain("4 items");
    expect(nav().querySelector("[aria-label='Next page']")).not.toBeNull();

    culture.setExplicit("de-DE");
    await settle(renderer);
    expect(nav().getAttribute("aria-label")).toBe("Seiten");
    expect(nav().textContent).toContain("Seite 1 von 2");
    expect(nav().textContent).toContain("4 Einträge");
    expect(nav().querySelector("[aria-label='Nächste Seite']")).not.toBeNull();
    // Not in the table: English.
    expect(nav().querySelector("[aria-label='Last page']")).not.toBeNull();
  });

  it("give way to a text parameter", async () => {
    const { culture, nav, ...renderer } = await mount({ ariaLabel: "Orders pages" });
    culture.setExplicit("de-DE");
    await settle(renderer);
    expect(nav().getAttribute("aria-label")).toBe("Orders pages");
  });

  it("format dates in the CultureService's culture when the component has no locale (D4)", async () => {
    const culture = new CultureService("en-US");
    const localizer = new StringLocalizer({ culture, defaultCulture: "en", tables: {} });
    const renderer = await renderTree(
      (b) => {
        b.openComponent(0, DatePicker);
        b.addAttribute(1, "value", "2026-10-10");
        b.addAttribute(2, "label", "Pickup");
        b.closeComponent();
      },
      {
        services: (services) => {
          services.registerValue(CultureService as never, culture);
          services.registerValue(StringLocalizer as never, localizer);
        },
      },
    );
    await renderer.settle();
    const input = () => renderer.container.querySelector("input")!;
    expect(input().value).toBe("10/10/2026");

    culture.setExplicit("de-DE");
    await settle(renderer);
    expect(input().value).toBe("10.10.2026");
  });
});

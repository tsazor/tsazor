import { afterEach, describe, expect, it } from "vitest";
import { toolbarFocus } from "../src/index";

afterEach(() => {
  document.body.innerHTML = "";
});

function toolbar(markup: string, orientation?: "horizontal" | "vertical") {
  const host = document.createElement("div");
  host.setAttribute("role", "toolbar");
  host.innerHTML = markup;
  document.body.appendChild(host);
  const cleanup = toolbarFocus({ orientation })(host) as () => void;
  return { host, cleanup, buttons: () => [...host.querySelectorAll<HTMLElement>("button, input")] };
}

const key = (target: Element, name: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
const tabindexes = (items: HTMLElement[]) => items.map((item) => item.getAttribute("tabindex"));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("toolbarFocus (the WAI-ARIA toolbar pattern)", () => {
  it("is one tab stop; the arrows move between the controls and wrap, skipping disabled ones; Home and End jump", () => {
    const { buttons } = toolbar('<button>Bold</button><button disabled>Italic</button><button>Link</button><button>Quote</button>');
    const [bold, , link, quote] = buttons();
    expect(tabindexes([bold!, link!, quote!])).toEqual(["0", "-1", "-1"]);
    bold!.focus();
    key(bold!, "ArrowRight");
    expect(document.activeElement).toBe(link);
    expect(tabindexes([bold!, link!, quote!])).toEqual(["-1", "0", "-1"]);
    key(link!, "End");
    expect(document.activeElement).toBe(quote);
    key(quote!, "ArrowRight");
    expect(document.activeElement).toBe(bold);
    key(bold!, "ArrowLeft");
    expect(document.activeElement).toBe(quote);
    key(quote!, "Home");
    expect(document.activeElement).toBe(bold);
  });

  it("keeps the last focused control as the tab stop, and the arrows edit a text field's text", () => {
    const { buttons } = toolbar('<button>Find</button><input aria-label="Search"><button>Go</button>');
    const [find, search, go] = buttons();
    go!.focus();
    expect(tabindexes([find!, search!, go!])).toEqual(["-1", "-1", "0"]);
    search!.focus();
    expect(key(search!, "ArrowLeft")).toBe(true);
    expect(document.activeElement).toBe(search);
  });

  it("vertical moves with up and down; new controls join with tabindex -1", async () => {
    const { host, buttons } = toolbar("<button>Up</button><button>Down</button>", "vertical");
    const [up, down] = buttons();
    up!.focus();
    key(up!, "ArrowDown");
    expect(document.activeElement).toBe(down);
    const added = document.createElement("button");
    added.textContent = "New";
    host.appendChild(added);
    await flush();
    expect(added.getAttribute("tabindex")).toBe("-1");
  });

  it("leaves the controls of a menu it opened to the menu", () => {
    const { buttons } = toolbar('<button>Menu</button><div role="menu"><button>Item</button></div><button>Next</button>');
    const [menu, item, next] = buttons();
    expect(item!.hasAttribute("tabindex")).toBe(false);
    menu!.focus();
    key(menu!, "ArrowRight");
    expect(document.activeElement).toBe(next);
  });
});

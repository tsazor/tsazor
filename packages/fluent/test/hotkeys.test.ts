/**
 * Hotkey (MudBlazor's MudHotkey) and KeyCode (Fluent UI Blazor's FluentKeyCode): a combination on the whole page, not
 * while typing unless asked, the content shown and hidden again, the key stopped; the keys of a content or the page,
 * filtered, their default prevented for some.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, renderTree, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Hotkey, KeyCode } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}, type = "keydown"): KeyboardEvent => {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

async function hotkey(attrs: Record<string, unknown>) {
  class Host extends ComponentBase {
    static last: Host | undefined;
    pressed: string[] = [];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openElement(0, "input");
      b.addAttribute(1, "id", "field");
      b.closeElement();
      b.openComponent(2, Hotkey);
      b.addAttribute(3, "onHotkeyPressed", EventCallback.bind(this, (e: KeyboardEvent) => {
        this.pressed.push(e.key);
      }));
      b.addAttribute(4, "childContent", (c: RenderTreeBuilder) => {
        c.openElement(0, "p");
        c.addAttribute(1, "class", "shortcuts");
        c.addContent(2, "Shortcuts");
        c.closeElement();
      });
      let seq = 5;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.closeComponent();
    }
  }
  const result = await render(Host);
  mounted.push(result);
  const idle = () => result.settle();
  const shown = () => result.container.querySelector(".shortcuts") !== null;
  return { Host, result, idle, shown, field: () => result.container.querySelector<HTMLInputElement>("#field")! };
}

describe("Hotkey", () => {
  it("raises onHotkeyPressed for its combination anywhere on the page, stops the key and shows the content", async () => {
    const { Host, idle, shown } = await hotkey({ keys: "Ctrl+K" });
    expect(shown()).toBe(false);
    const event = press(document.body, "k", { ctrlKey: true });
    await idle();
    expect(event.defaultPrevented).toBe(true);
    expect(Host.last!.pressed).toEqual(["k"]);
    expect(shown()).toBe(true);
    press(document.body, "k");
    press(document.body, "j", { ctrlKey: true });
    await idle();
    expect(Host.last!.pressed).toEqual(["k"]);
  });

  it("a plain key doesn't act while someone types, unless inTextFields", async () => {
    const { Host, idle, field } = await hotkey({ keys: "?" });
    press(field(), "?", { shiftKey: true });
    await idle();
    expect(Host.last!.pressed).toEqual([]);
    press(document.body, "?", { shiftKey: true });
    await idle();
    expect(Host.last!.pressed).toEqual(["?"]);
    const typing = await hotkey({ keys: "?", inTextFields: true });
    press(typing.field(), "?", { shiftKey: true });
    await typing.idle();
    expect(typing.Host.last!.pressed).toEqual(["?"]);
  });

  it("hideChildContentOnRepress toggles; a held key counts once; disabled and preventEventPropagation false", async () => {
    const toggling = await hotkey({ keys: "Escape", hideChildContentOnRepress: true });
    press(document.body, "Escape");
    await toggling.idle();
    expect(toggling.shown()).toBe(true);
    press(document.body, "Escape", { repeat: true });
    await toggling.idle();
    expect(toggling.shown()).toBe(true);
    press(document.body, "Escape");
    await toggling.idle();
    expect(toggling.shown()).toBe(false);
    const disabled = await hotkey({ keys: "g", disabled: true });
    press(document.body, "g");
    await disabled.idle();
    expect(disabled.Host.last!.pressed).toEqual([]);
    const passing = await hotkey({ keys: "g", preventEventPropagation: false });
    const event = press(document.body, "g");
    await passing.idle();
    expect(passing.Host.last!.pressed).toEqual(["g"]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops listening when it goes away", async () => {
    const { Host, result } = await hotkey({ keys: "g" });
    const host = Host.last!;
    result.dispose();
    mounted.splice(mounted.indexOf(result), 1);
    press(document.body, "g");
    expect(host.pressed).toEqual([]);
  });
});

describe("KeyCode", () => {
  async function keyCode(attrs: Record<string, unknown>) {
    const downs: string[] = [];
    const ups: string[] = [];
    const result = await renderTree((b) => {
      b.openElement(0, "button");
      b.addAttribute(1, "id", "anchor");
      b.closeElement();
      b.openComponent(2, KeyCode);
      b.addAttribute(3, "onKeyDown", EventCallback.unbound((e: KeyboardEvent) => void downs.push(e.key)));
      b.addAttribute(4, "onKeyUp", EventCallback.unbound((e: KeyboardEvent) => void ups.push(e.key)));
      b.addAttribute(5, "childContent", (c: RenderTreeBuilder) => {
        c.openElement(0, "input");
        c.addAttribute(1, "id", "inside");
        c.closeElement();
      });
      let seq = 6;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.closeComponent();
    });
    mounted.push(result);
    await result.settle();
    return { result, downs, ups, inside: () => result.container.querySelector("#inside"), anchor: () => result.container.querySelector("#anchor")! };
  }

  it("reports the keys in its content, not the modifiers alone, and wraps it in a span", async () => {
    const { result, downs, ups, inside } = await keyCode({});
    expect(inside()!.parentElement!.tagName).toBe("SPAN");
    expect(inside()!.parentElement!.className).toBe("fui-key-code");
    press(inside()!, "a");
    press(inside()!, "Shift");
    press(inside()!, "a", {}, "keyup");
    press(result.container.querySelector("#anchor")!, "b");
    expect(downs).toEqual(["a"]);
    expect(ups).toEqual(["a"]);
  });

  it("only, ignore, preventDefaultOnly, stopRepeat", async () => {
    const { downs, inside } = await keyCode({ only: ["Enter", "ArrowDown", "x"], ignore: ["x"], preventDefaultOnly: ["ArrowDown"], stopRepeat: true });
    press(inside()!, "a");
    press(inside()!, "x");
    const enter = press(inside()!, "Enter");
    const down = press(inside()!, "ArrowDown");
    press(inside()!, "ArrowDown", { repeat: true });
    expect(downs).toEqual(["Enter", "ArrowDown"]);
    expect(enter.defaultPrevented).toBe(false);
    expect(down.defaultPrevented).toBe(true);
  });

  it("globalDocument listens on the page, without a wrapper", async () => {
    const page = await keyCode({ globalDocument: true });
    expect(page.inside()).toBeNull();
    press(document.body, "q");
    expect(page.downs).toEqual(["q"]);
  });

  it("anchor listens on the element with that id", async () => {
    const anchored = await keyCode({ anchor: "anchor", preventDefault: true });
    expect(anchored.inside()).toBeNull();
    const event = press(anchored.anchor(), "w");
    expect(anchored.downs).toEqual(["w"]);
    expect(event.defaultPrevented).toBe(true);
  });
});

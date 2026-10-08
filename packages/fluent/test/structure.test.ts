/**
 * The Tier 1 components the Fluent skin shares with @tsazor/bootstrap:
 * RadioGroup, Accordion, Collapse, Progress, ListGroup — same parameters,
 * Fluent markup.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment } from "@tsazor/runtime";
import { Accordion, AccordionItem, CheckboxGroup, Collapse, ListGroup, ListGroupItem, Navbar, Progress, RadioGroup } from "../dist/index.js";

const text = (content: string): RenderFragment => (b) => b.addContent(0, content);

type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

beforeAll(() => {
  document.body.innerHTML = "";
});

describe("RadioGroup", () => {
  it("renders one radio per option in a labelled fieldset and reports the choice", async () => {
    const chosen: string[] = [];
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, RadioGroup);
      b.addAttribute(1, "label", "Slicing");
      b.addAttribute(2, "options", [{ value: "whole", label: "Whole" }, { value: "sliced", label: "Sliced" }, { value: "thin", label: "Thin", disabled: true }]);
      b.addAttribute(3, "value", "whole");
      b.addAttribute(4, "valueChanged", EventCallback.unbound((value: string) => {
        chosen.push(value);
      }));
      b.closeComponent();
    });
    await settle(renderer);
    expect(container.querySelector("fieldset legend")!.textContent).toBe("Slicing");
    const radios = [...container.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios[2]!.disabled).toBe(true);
    expect(container.querySelector(`label[for="${radios[1]!.id}"]`)!.textContent).toBe("Sliced");
    radios[1]!.checked = true;
    radios[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(chosen).toEqual(["sliced"]);
  });
});

describe("CheckboxGroup", () => {
  it("checks the bound values, reports the new array in the options' order, and keeps values it doesn't show", async () => {
    const reported: string[][] = [];
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, CheckboxGroup);
      b.addAttribute(1, "label", "Roles");
      b.addAttribute(2, "options", [{ value: "admins", label: "Administrators" }, { value: "editors", label: "Editors" }, { value: "guests", label: "Guests", disabled: true }]);
      // "authenticated" is the user's but not an option here.
      b.addAttribute(3, "value", ["authenticated", "editors"]);
      b.addAttribute(4, "valueChanged", EventCallback.unbound((value: string[]) => {
        reported.push(value);
      }));
      b.closeComponent();
    });
    await settle(renderer);
    expect(container.querySelector("fieldset legend")!.textContent).toBe("Roles");
    const boxes = [...container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((box) => box.checked)).toEqual([false, true, false]);
    expect(boxes[2]!.disabled).toBe(true);
    expect(container.querySelector(`label[for="${boxes[0]!.id}"]`)!.textContent).toBe("Administrators");
    boxes[0]!.checked = true;
    boxes[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(reported).toEqual([["authenticated", "admins", "editors"]]);
  });
});

describe("Accordion + AccordionItem", () => {
  it("opens one item at a time; the panel is a region labelled by its header", async () => {
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Accordion);
      b.addAttribute(1, "childContent", (inner: typeof b) => {
        for (let i = 0; i < 2; i++) {
          inner.openComponent(i * 3, AccordionItem);
          inner.addAttribute(i * 3 + 1, "title", `Item ${i}`);
          inner.addAttribute(i * 3 + 2, "childContent", text(`Body ${i}`));
          inner.closeComponent();
        }
      });
      b.closeComponent();
    });
    await settle(renderer);
    const buttons = container.querySelectorAll<HTMLButtonElement>(".fui-accordion__button");
    expect(buttons).toHaveLength(2);
    expect([...buttons].map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    const panel = container.querySelector(".fui-accordion__panel")!;
    expect(panel.textContent).toBe("Body 0");
    expect(panel.getAttribute("role")).toBe("region");
    expect(panel.getAttribute("aria-labelledby")).toBe(buttons[0]!.id);
    expect(buttons[0]!.getAttribute("aria-controls")).toBe(panel.id);

    buttons[1]!.click();
    await settle(renderer);
    expect(container.querySelectorAll(".fui-accordion__panel")).toHaveLength(1);
    expect(container.querySelector(".fui-accordion__panel")!.textContent).toBe("Body 1");
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Collapse, Progress", () => {
  it("renders its content only while open", async () => {
    const closed = await renderTree((b) => {
      b.openComponent(0, Collapse);
      b.addAttribute(1, "childContent", text("Details"));
      b.closeComponent();
    });
    expect(closed.container.textContent).toBe("");
    const open = await renderTree((b) => {
      b.openComponent(0, Collapse);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "childContent", text("Details"));
      b.closeComponent();
    });
    expect(open.container.querySelector(".fui-collapse")!.textContent).toBe("Details");
  });

  it("clamps the value, colors the bar by intent and names the progressbar", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Progress);
      b.addAttribute(1, "value", 250);
      b.addAttribute(2, "intent", "success");
      b.addAttribute(3, "label", "Upload");
      b.closeComponent();
    });
    const bar = container.querySelector("[role=progressbar]")!;
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-label")).toBe("Upload");
    const fill = container.querySelector(".fui-progress__bar")!;
    expect(fill.className).toBe("fui-progress__bar fui-progress__bar--success");
    expect(fill.getAttribute("style")!.replace(";", "")).toBe("width: 100%");
  });
});

describe("ListGroup + ListGroupItem", () => {
  it("renders li items holding links and buttons, and fires clicks", async () => {
    let clicked = 0;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, ListGroup);
      b.addAttribute(1, "childContent", (inner: typeof b) => {
        inner.openComponent(0, ListGroupItem);
        inner.addAttribute(1, "active", true);
        inner.addAttribute(2, "href", "/one");
        inner.addAttribute(3, "childContent", text("One"));
        inner.closeComponent();
        inner.openComponent(4, ListGroupItem);
        inner.addAttribute(5, "onClick", EventCallback.unbound(() => {
          clicked++;
        }));
        inner.addAttribute(6, "childContent", text("Two"));
        inner.closeComponent();
        inner.openComponent(7, ListGroupItem);
        inner.addAttribute(8, "childContent", text("Three"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    const items = container.querySelectorAll(".fui-list__item");
    expect([...container.querySelector(".fui-list")!.children].map((child) => child.tagName)).toEqual(["LI", "LI", "LI"]);
    expect(items[0]!.className).toContain("fui-list__item--active");
    expect(items[0]!.querySelector("a")!.getAttribute("aria-current")).toBe("true");
    expect(items[2]!.textContent).toBe("Three");
    items[1]!.querySelector("button")!.click();
    await settle(renderer);
    expect(clicked).toBe(1);
  });
});

describe("Navbar", () => {
  it("is a named nav with the brand and the links", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Navbar);
      b.addAttribute(1, "brand", "Bakery");
      b.addAttribute(2, "theme", "dark");
      b.addAttribute(3, "ariaLabel", "Main");
      b.addAttribute(4, "childContent", (inner: typeof b) => {
        inner.openElement(0, "a");
        inner.addAttribute(1, "href", "/orders");
        inner.addContent(2, "Orders");
        inner.closeElement();
      });
      b.closeComponent();
    });
    const nav = container.querySelector("nav")!;
    expect(nav.className).toBe("fui-navbar fui-navbar--dark");
    expect(nav.getAttribute("aria-label")).toBe("Main");
    expect(nav.querySelector(".fui-navbar__brand")!.textContent).toBe("Bakery");
    expect(nav.querySelector(".fui-navbar__nav a")!.textContent).toBe("Orders");
  });
});

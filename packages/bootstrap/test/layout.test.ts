/**
 * Switch, Stack and Divider — the components the Bootstrap skin shares with
 * @tsazor/fluent: same parameters, Bootstrap classes.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment } from "@tsazor/runtime";
import { Divider, Grid, Stack, Switch, Typography } from "../dist/index.js";

const text = (content: string): RenderFragment => (b) => b.addContent(0, content);

describe("Switch", () => {
  it("is a role=switch checkbox in .form-switch and reports the new value", async () => {
    const values: boolean[] = [];
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Switch);
      b.addAttribute(1, "label", "Reminders");
      b.addAttribute(2, "value", false);
      b.addAttribute(3, "valueChanged", EventCallback.unbound((value: boolean) => {
        values.push(value);
      }));
      b.closeComponent();
    });
    const input = container.querySelector<HTMLInputElement>("input")!;
    expect(container.querySelector(".form-check.form-switch")).not.toBeNull();
    expect(input.getAttribute("role")).toBe("switch");
    expect(container.querySelector(`label[for="${input.id}"]`)!.textContent).toBe("Reminders");
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await renderer.settle();
    expect(values).toEqual([true]);
  });
});

describe("Stack", () => {
  it("maps direction, gap, align, justify and wrap to the flex utilities", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Stack);
      b.addAttribute(1, "direction", "vertical");
      b.addAttribute(2, "gap", "m");
      b.addAttribute(3, "align", "center");
      b.addAttribute(4, "justify", "space-between");
      b.addAttribute(5, "wrap", true);
      b.addAttribute(6, "childContent", text("items"));
      b.closeComponent();
    });
    expect(container.firstElementChild!.className).toBe("d-flex flex-column gap-3 align-items-center justify-content-between flex-wrap");
  });
});

describe("Divider", () => {
  it("is an hr across, or a .vr between items in a row, as a separator", async () => {
    const across = await renderTree((b) => {
      b.openComponent(0, Divider);
      b.closeComponent();
    });
    const hr = across.container.querySelector("hr")!;
    expect(hr.getAttribute("role")).toBe("separator");
    expect(hr.getAttribute("aria-orientation")).toBe("horizontal");
    const between = await renderTree((b) => {
      b.openComponent(0, Divider);
      b.addAttribute(1, "orientation", "vertical");
      b.addAttribute(2, "appearance", "stronger");
      b.closeComponent();
    });
    const vr = between.container.querySelector("[role=separator]")!;
    expect(vr.className).toBe("vr opacity-75");
    expect(vr.getAttribute("aria-orientation")).toBe("vertical");
  });
});

describe("Grid, Typography", () => {
  it("lays out equal columns or auto-fill tracks with a gap", async () => {
    const fixed = await renderTree((b) => {
      b.openComponent(0, Grid);
      b.addAttribute(1, "columns", 2);
      b.addAttribute(2, "gap", "l");
      b.closeComponent();
    });
    const grid = fixed.container.firstElementChild as HTMLElement;
    expect(grid.className).toBe("d-grid gap-4");
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
    const fluid = await renderTree((b) => {
      b.openComponent(0, Grid);
      b.addAttribute(1, "minChildWidth", "240px");
      b.closeComponent();
    });
    expect((fluid.container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(240px, 1fr))");
  });

  it("renders another element with the variant's look through `as`: an h1 with Bootstrap's h5 class", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Typography);
      b.addAttribute(1, "variant", "h5");
      b.addAttribute(2, "as", "h1");
      b.addAttribute(3, "childContent", text("Brands"));
      b.closeComponent();
    });
    const h1 = container.querySelector("h1")!;
    expect(h1.className).toBe("h5");
    expect(container.querySelector("h5")).toBeNull();
  });

  it("picks the element by variant and the weight by class", async () => {
    const heading = await renderTree((b) => {
      b.openComponent(0, Typography);
      b.addAttribute(1, "variant", "h2");
      b.addAttribute(2, "weight", "bold");
      b.addAttribute(3, "childContent", text("Orders"));
      b.closeComponent();
    });
    const h2 = heading.container.querySelector("h2")!;
    expect(h2.textContent).toBe("Orders");
    expect(h2.className).toBe("fw-bold");
    const caption = await renderTree((b) => {
      b.openComponent(0, Typography);
      b.addAttribute(1, "variant", "caption");
      b.addAttribute(2, "childContent", text("Updated 5 min ago"));
      b.closeComponent();
    });
    expect(caption.container.querySelector("small")!.className).toBe("d-block text-body-secondary");
  });
});

describe("class on a component", () => {
  it("adds to the component's own classes instead of replacing them", async () => {
    const { Button: SkinButton, TextInput: SkinTextInput } = await import("../dist/index.js");
    const { container } = await renderTree((b) => {
      b.openComponent(0, SkinButton);
      b.addAttribute(1, "intent", "danger");
      b.addAttribute(2, "class", "delete");
      b.addAttribute(3, "childContent", text("Delete"));
      b.closeComponent();
      b.openComponent(4, SkinTextInput);
      b.addAttribute(5, "class", "wide");
      b.closeComponent();
    });
    expect(container.querySelector("button")!.className).toBe("btn btn-danger delete");
    expect(container.querySelector("input")!.className).toBe("form-control wide");
  });
});

/**
 * @tsazor/fluent primitive tests: every component renders through the real
 * compiled pipeline (dist/*.js built by build.mjs) and mounts via
 * @tsazor/testing's happy-dom renderer — same approach as @tsazor/components.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment } from "@tsazor/runtime";
import { Badge, Button, Card, CardFooter, CardHeader, Divider, Spinner } from "../dist/index.js";

/** A fragment rendering one text node. */
function text(content: string): RenderFragment {
  return (b) => b.addContent(0, content);
}

beforeAll(() => {
  document.body.innerHTML = "";
});

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Awaited<ReturnType<typeof renderTree>>["renderer"]): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

describe("Button", () => {
  it("renders Fluent appearance classes and fires onClick", async () => {
    let clicks = 0;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "appearance", "primary");
      b.addAttribute(2, "size", "large");
      b.addAttribute(3, "childContent", text("Go"));
      b.addAttribute(4, "onClick", EventCallback.unbound(() => {
        clicks++;
      }));
      b.closeComponent();
    });
    const button = container.querySelector("button")!;
    expect(button.className).toBe("fui-button fui-button--primary fui-button--large");
    expect(button.textContent).toBe("Go");
    button.click();
    await settle(renderer);
    expect(clicks).toBe(1);
  });

  it("renders the disabled attribute and swallows clicks", async () => {
    let clicks = 0;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "disabled", true);
      b.addAttribute(2, "onClick", EventCallback.unbound(() => {
        clicks++;
      }));
      b.closeComponent();
    });
    const button = container.querySelector("button")!;
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.className).toContain("fui-button--disabled");
    button.click();
    await settle(renderer);
    expect(clicks).toBe(0);
  });

  it("omits aria-label entirely when unset (null-attribute semantics)", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.closeComponent();
    });
    expect(container.querySelector("button")!.hasAttribute("aria-label")).toBe(false);
  });

  it("renders aria-label and aria-describedby where the app supplies them (4.2)", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "ariaLabel", "Delete row");
      b.addAttribute(2, "ariaDescribedBy", "delete-hint");
      b.closeComponent();
    });
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Delete row");
    expect(button.getAttribute("aria-describedby")).toBe("delete-hint");
  });

  it("captures unmatched @attributes and appends the user class (4.2)", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "class", "cta cta--tight");
      b.addAttribute(2, "data-testid", "save");
      b.addAttribute(3, "childContent", text("Save"));
      b.closeComponent();
    });
    const button = container.querySelector("button")!;
    expect(button.className).toBe("fui-button fui-button--secondary cta cta--tight");
    expect(button.getAttribute("data-testid")).toBe("save");
  });
});

describe("Badge", () => {
  it("composes appearance and color classes", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Badge);
      b.addAttribute(1, "appearance", "subtle");
      b.addAttribute(2, "color", "error");
      b.addAttribute(3, "childContent", text("3"));
      b.closeComponent();
    });
    const badge = container.querySelector(".fui-badge")!;
    expect(badge.className).toBe("fui-badge fui-badge--subtle fui-badge--error");
    expect(badge.textContent).toBe("3");
  });
});

describe("Spinner", () => {
  it("carries status semantics and the size class", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Spinner);
      b.addAttribute(1, "size", "large");
      b.addAttribute(2, "ariaLabel", "Loading…");
      b.closeComponent();
    });
    const spinner = container.querySelector(".fui-spinner")!;
    expect(spinner.getAttribute("role")).toBe("status");
    expect(spinner.getAttribute("aria-label")).toBe("Loading…");
    expect(spinner.className).toBe("fui-spinner fui-spinner--large");
  });

  it("keeps an accessible name on the status node (default label)", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Spinner);
      b.closeComponent();
    });
    const spinner = container.querySelector(".fui-spinner")!;
    expect(spinner.getAttribute("aria-label")).toBe("Loading…");
  });
});

describe("Card family", () => {
  it("stacks header, body and footer slots", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Card);
      b.addAttribute(1, "childContent", (inner) => {
        inner.openComponent(0, CardHeader);
        inner.addAttribute(1, "childContent", text("Users"));
        inner.closeComponent();
        inner.openElement(2, "p");
        inner.addContent(3, "Body");
        inner.closeElement();
        inner.openComponent(4, CardFooter);
        inner.addAttribute(5, "childContent", text("Updated today"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    const card = container.querySelector(".fui-card")!;
    expect(card.querySelector(".fui-card-header")!.textContent).toBe("Users");
    expect(card.querySelector("p")!.textContent).toBe("Body");
    expect(card.querySelector(".fui-card-footer")!.textContent).toBe("Updated today");
  });
});

describe("Divider", () => {
  it("flips to a vertical separator with appearance variants", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Divider);
      b.addAttribute(1, "orientation", "vertical");
      b.addAttribute(2, "appearance", "stronger");
      b.closeComponent();
    });
    const divider = container.querySelector("hr")!;
    expect(divider.className).toBe("fui-divider fui-divider--vertical fui-divider--stronger");
    expect(divider.getAttribute("aria-orientation")).toBe("vertical");
  });
});
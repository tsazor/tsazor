/**
 * @tsazor/bootstrap behavioral tests: every component renders through the
 * real compiled pipeline (dist/*.js built by build.mjs from the .tsazor
 * sources) and mounts via @tsazor/testing's happy-dom renderer.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { ErrorBoundary, EventCallback, ServiceCollection, type RenderFragment } from "@tsazor/runtime";
import { icon } from "@tsazor/ui";
import {
  addBootstrap,
  Accordion,
  AccordionItem,
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  Drawer,
  ToastRegion,
  Toaster,
  Tooltip,
  Form,
  Icon,
  RadioGroup,
  TextInput,
  Collapse,
  Dropdown,
  DropdownItem,
  ListGroup,
  ListGroupItem,
  Modal,
  Navbar,
  Pagination,
  Progress,
  Spinner,
  Tab,
  Table,
  Tabs,
} from "../dist/index.js";

/** A fragment rendering one text node. */
function text(content: string): RenderFragment {
  return (b) => b.addContent(0, content);
}

beforeAll(() => {
  document.body.innerHTML = "";
});

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Pick<Awaited<ReturnType<typeof renderTree>>, "settle">): Promise<void> {
  await renderer.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.settle();
}

describe("Button", () => {
  it("renders variant classes and fires onClick", async () => {
    let clicks = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "intent", "success");
      b.addAttribute(2, "appearance", "outline");
      b.addAttribute(3, "size", "large");
      b.addAttribute(4, "childContent", text("Go"));
      b.addAttribute(5, "onClick", EventCallback.unbound(() => {
        clicks++;
      }));
      b.closeComponent();
    });
    const button = container.querySelector("button")!;
    expect(button.className).toContain("btn-outline-success");
    expect(button.className).toContain("btn-lg");
    expect(button.textContent).toBe("Go");
    button.click();
    await settle(renderer);
    expect(clicks).toBe(1);
  });

  it("renders the disabled attribute when disabled", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "disabled", true);
      b.closeComponent();
    });
    expect(container.querySelector("button")!.hasAttribute("disabled")).toBe(true);
  });
});

describe("what the Fluent skin had and this one lacked (parity)", () => {
  it("Button: aria-describedby and a circular shape; Card: a labelled region", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "ariaDescribedBy", "hint");
      b.addAttribute(2, "shape", "circular");
      b.addAttribute(3, "childContent", text("Save"));
      b.closeComponent();
      b.openComponent(4, Card);
      b.addAttribute(5, "ariaLabel", "Order");
      b.closeComponent();
    });
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-describedby")).toBe("hint");
    expect(button.className).toContain("rounded-pill");
    const card = container.querySelector(".card")!;
    expect(card.getAttribute("aria-label")).toBe("Order");
    expect(card.getAttribute("role")).toBe("region");
  });
});

describe("Icon", () => {
  it("draws its value as a decorative .bi svg, and nothing without one", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Icon);
      b.addAttribute(1, "value", icon("close", '<path d="M3 3l10 10M13 3L3 13"/>', "0 0 16 16"));
      b.closeComponent();
    });
    const svg = container.querySelector("svg.bi")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("path")!.getAttribute("d")).toBe("M3 3l10 10M13 3L3 13");
    const empty = await renderTree((b) => {
      b.openComponent(0, Icon);
      b.closeComponent();
    });
    expect(empty.container.querySelector("svg")).toBeNull();
  });

  it("draws an app's own icon, named by its title", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Icon);
      b.addAttribute(1, "value", icon("dot", '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/></svg>'));
      b.addAttribute(2, "title", "Online");
      b.addAttribute(3, "class", "text-success");
      b.closeComponent();
    });
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toBe("bi text-success");
    expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Online");
    expect(svg.querySelector("circle")!.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});

describe("Badge", () => {
  it("renders the variant and pill shape", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Badge);
      b.addAttribute(1, "intent", "danger");
      b.addAttribute(2, "pill", true);
      b.addAttribute(3, "childContent", text("3"));
      b.closeComponent();
    });
    const badge = container.querySelector(".badge")!;
    expect(badge.className).toContain("bg-danger");
    expect(badge.className).toContain("rounded-pill");
    expect(badge.textContent).toBe("3");
  });
});

describe("Alert", () => {
  it("renders and dismisses, firing onDismissed", async () => {
    let dismissed = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Alert);
      b.addAttribute(1, "intent", "warning");
      b.addAttribute(2, "dismissible", true);
      b.addAttribute(3, "onDismissed", EventCallback.unbound(() => {
        dismissed++;
      }));
      b.addAttribute(4, "childContent", text("Careful!"));
      b.closeComponent();
    });
    expect(container.querySelector(".alert-warning")!.textContent).toContain("Careful!");
    container.querySelector(".btn-close")!.dispatchEvent(new Event("click", { bubbles: true }));
    await settle(renderer);
    expect(dismissed).toBe(1);
    expect(container.querySelector(".alert")).toBeNull();
  });
});

describe("Card family", () => {
  it("composes header, title, body and footer", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Card);
      b.addAttribute(1, "childContent", (inner: typeof b) => {
        inner.openComponent(0, CardHeader);
        inner.addAttribute(1, "childContent", text("Header"));
        inner.closeComponent();
        inner.openComponent(2, CardBody);
        inner.addAttribute(3, "childContent", (body: typeof b) => {
          body.openComponent(0, CardTitle);
          body.addAttribute(1, "childContent", text("Title"));
          body.closeComponent();
        });
        inner.closeComponent();
        inner.openComponent(4, CardFooter);
        inner.addAttribute(5, "childContent", text("Footer"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    expect(container.querySelector(".card")!.querySelector(".card-header")!.textContent).toBe("Header");
    expect(container.querySelector(".card-title")!.textContent).toBe("Title");
    expect(container.querySelector(".card-body")!.textContent).toContain("Title");
    expect(container.querySelector(".card-footer")!.textContent).toBe("Footer");
  });
});

describe("Modal", () => {
  it("renders nothing when closed", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Modal);
      b.addAttribute(1, "isOpen", false);
      b.addAttribute(2, "childContent", text("Body"));
      b.closeComponent();
    });
    expect(container.querySelector(".modal")).toBeNull();
    expect(container.querySelector(".modal-backdrop")).toBeNull();
  });

  it("shows title, body and fires onClosed from the close button", async () => {
    let closed = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Modal);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "title", "Confirm");
      b.addAttribute(3, "onClosed", EventCallback.unbound(() => {
        closed++;
      }));
      b.addAttribute(4, "childContent", text("Sure?"));
      b.closeComponent();
    });
    expect(container.querySelector(".modal-title")!.textContent).toBe("Confirm");
    // An h2 in the h5 look: the level under the page's h1, as the Fluent skin's dialog (the look stays Bootstrap's).
    expect(container.querySelector(".modal-title")!.tagName).toBe("H2");
    expect(container.querySelector(".modal-body")!.textContent).toBe("Sure?");
    expect(container.querySelector(".modal-backdrop")).not.toBeNull();
    container.querySelector(".btn-close")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(closed).toBe(1);
  });

  it("does not close when the dialog body is clicked", async () => {
    let closed = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Modal);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "onClosed", EventCallback.unbound(() => {
        closed++;
      }));
      b.addAttribute(3, "childContent", text("Body"));
      b.closeComponent();
    });
    container.querySelector(".modal-body")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(closed).toBe(0);
  });
});

describe("Dialog (the modal dialog pattern, on @tsazor/ui)", () => {
  async function open(onClosed: () => void) {
    return renderTree((b) => {
      b.openComponent(0, Dialog);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "title", "Delete order");
      b.addAttribute(3, "onClosed", EventCallback.unbound(onClosed));
      b.addAttribute(4, "childContent", (c: Parameters<RenderFragment>[0]) => {
        c.openElement(0, "input");
        c.closeElement();
      });
      b.closeComponent();
    });
  }

  it("is a labelled modal dialog that takes focus and locks the page scroll", async () => {
    const { container, ...renderer } = await open(() => {});
    await settle(renderer);
    const dialog = container.querySelector<HTMLElement>("[role=dialog]")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Delete order");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("asks to close on Escape and on a press on the backdrop, not inside", async () => {
    let closed = 0;
    const { container, ...renderer } = await open(() => closed++);
    await settle(renderer);
    container.querySelector(".modal-body")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closed).toBe(0);
    container.querySelector(".modal")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(renderer);
    expect(closed).toBe(2);
  });

  it("is also exported as Modal", () => {
    expect(Modal).toBe(Dialog);
  });
});

describe("Form + inputs (FieldState from @tsazor/ui)", () => {
  it("links label, help and message; shows the message only after a submit; turns valid when fixed", async () => {
    const model = { name: "", size: "" };
    let invalidSubmits = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Form);
      b.addAttribute(1, "model", model);
      b.addAttribute(2, "validators", { name: (value: unknown) => (value ? null : "Name is required") });
      b.addAttribute(3, "onInvalidSubmit", EventCallback.unbound(() => {
        invalidSubmits++;
      }));
      b.addAttribute(4, "childContent", () => (c: Parameters<RenderFragment>[0]) => {
        c.openComponent(0, TextInput);
        c.addAttribute(1, "label", "Name");
        c.addAttribute(2, "help", "As on the order");
        c.addAttribute(3, "Value", model.name);
        c.addAttribute(4, "ValueChanged", EventCallback.unbound((value: string) => {
          model.name = value;
        }));
        c.addAttribute(5, "ValueExpression", "name");
        c.closeComponent();
        c.openComponent(6, RadioGroup);
        c.addAttribute(7, "label", "Size");
        c.addAttribute(8, "options", [{ value: "s", label: "Small" }, { value: "l", label: "Large" }]);
        c.addAttribute(9, "Value", model.size);
        c.addAttribute(10, "ValueChanged", EventCallback.unbound((value: string) => {
          model.size = value;
        }));
        c.addAttribute(11, "ValueExpression", "size");
        c.closeComponent();
      });
      b.closeComponent();
    });
    await settle(renderer);
    const input = container.querySelector<HTMLInputElement>("input.form-control")!;
    expect(container.querySelector("label")!.getAttribute("for")).toBe(input.id);
    expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-help`);
    expect(container.querySelector(".invalid-feedback")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();

    // An invalid edit marks the field — for a screen reader too — before a submit; the message waits for one.
    for (const text of ["M", ""]) {
      input.value = text;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle(renderer);
    }
    expect(input.className).toContain("is-invalid");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".invalid-feedback")).toBeNull();

    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle(renderer);
    expect(invalidSubmits).toBe(1);
    const message = container.querySelector(".invalid-feedback")!;
    expect(message.textContent).toBe("Name is required");
    // Announced as it appears, as the Fluent skin's message is.
    expect(message.getAttribute("role")).toBe("alert");
    expect(input.className).toContain("is-invalid");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-help ${message.id}`);

    input.value = "Marta";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".invalid-feedback")).toBeNull();
    expect(input.className).toContain("is-valid");

    const radios = container.querySelectorAll<HTMLInputElement>("input[type=radio]");
    expect(container.querySelector("legend")!.textContent).toBe("Size");
    radios[1]!.checked = true;
    radios[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(model.size).toBe("l");
  });
});

describe("Drawer, ToastRegion, Tooltip", () => {
  it("Drawer is a modal dialog sliding in from its edge, closing on Escape", async () => {
    let closed = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Drawer);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "placement", "end");
      b.addAttribute(3, "title", "Filters");
      b.addAttribute(4, "onClosed", EventCallback.unbound(() => {
        closed++;
      }));
      b.addAttribute(5, "childContent", text("Only open orders"));
      b.closeComponent();
    });
    await settle(renderer);
    const panel = container.querySelector<HTMLElement>(".offcanvas")!;
    expect(panel.className).toContain("offcanvas-end");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)!.textContent).toBe("Filters");
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)!.tagName).toBe("H2");
    expect(panel.contains(document.activeElement)).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(renderer);
    expect(closed).toBe(1);
  });

  it("ToastRegion renders the Toaster's toasts and closes one with its button", async () => {
    const toaster = new Toaster();
    const { container, ...renderer } = await renderTree(
      (b) => {
        b.openComponent(0, ToastRegion);
        b.closeComponent();
      },
      { services: (services) => services.registerValue(Toaster, toaster) },
    );
    toaster.show({ title: "Saved", message: "Order 101", intent: "success", timeout: 0 });
    toaster.show({ message: "Offline", intent: "danger", timeout: 0 });
    await settle(renderer);
    const toasts = [...container.querySelectorAll<HTMLElement>(".toast")];
    expect(toasts.map((toast) => toast.className.includes("text-bg-success") || toast.className.includes("text-bg-danger"))).toEqual([true, true]);
    expect(toasts[0]!.textContent).toContain("Saved");
    expect(toasts[1]!.getAttribute("role")).toBe("alert");
    expect(container.querySelector(".toast-container")!.getAttribute("aria-live")).toBe("polite");
    toasts[0]!.querySelector<HTMLElement>(".btn-close")!.click();
    await settle(renderer);
    expect(toaster.toasts.map((toast) => toast.message)).toEqual(["Offline"]);
  });

  it("ToastRegion shows a toast's action: a click runs it and closes the toast", async () => {
    const toaster = new Toaster();
    const { container, ...renderer } = await renderTree(
      (b) => {
        b.openComponent(0, ToastRegion);
        b.closeComponent();
      },
      { services: (services) => services.registerValue(Toaster, toaster) },
    );
    const opened: string[] = [];
    toaster.show({ message: "Hi from John", intent: "primary", timeout: 0, action: { label: "Chat?", onClick: () => void opened.push("chat") } });
    await settle(renderer);
    const action = container.querySelector<HTMLButtonElement>(".toast .btn-link")!;
    expect(action.textContent).toBe("Chat?");
    action.click();
    await settle(renderer);
    expect(opened).toEqual(["chat"]);
    expect(toaster.toasts).toHaveLength(0);
  });

  it("addBootstrap registers one Toaster for the app (package.json tsazor.setup names it)", () => {
    const services = new ServiceCollection();
    addBootstrap(services);
    const provider = services.build();
    expect(provider.get(Toaster)).toBeInstanceOf(Toaster);
    expect(provider.get(Toaster)).toBe(provider.get(Toaster));
  });

  it("Tooltip describes the element inside it", async () => {
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Tooltip);
      b.addAttribute(1, "text", "Save the order");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        inner.openElement(0, "button");
        inner.addContent(1, "💾");
        inner.closeElement();
      });
      b.closeComponent();
    });
    await settle(renderer);
    const button = container.querySelector("button")!;
    button.dispatchEvent(new FocusEvent("focusin"));
    const tip = document.getElementById(button.getAttribute("aria-describedby")!)!;
    expect(tip.className).toBe("tooltip show");
    expect(tip.querySelector(".tooltip-inner")!.textContent).toBe("Save the order");
    button.dispatchEvent(new FocusEvent("focusout"));
    expect(tip.hidden).toBe(true);
  });
});

describe("Tabs + Tab", () => {
  function build(b: ReturnType<typeof Object.getPrototypeOf> & never): void {
    throw new Error("unused");
  }

  it("renders the nav after registration and switches panes on click", async () => {
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Tabs);
      b.addAttribute(1, "childContent", (inner: typeof b) => {
        inner.openComponent(0, Tab);
        inner.addAttribute(1, "title", "One");
        inner.addAttribute(2, "childContent", text("First pane"));
        inner.closeComponent();
        inner.openComponent(2, Tab);
        inner.addAttribute(3, "title", "Two");
        inner.addAttribute(4, "childContent", text("Second pane"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    await settle(renderer);

    const links = container.querySelectorAll(".nav-link");
    expect(links).toHaveLength(2);
    // The nav title renders the Tab's `title` value — once a compiler bug
    // rendered `@this.tabs[i]!.title` as `[object Object]!.title` because the
    // `!` non-null assertion split out of the expression.
    expect(links[0]!.textContent).toBe("One");
    expect(links[1]!.textContent).toBe("Two");
    expect(links[0]!.className).toContain("active");

    links[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    const panes = container.querySelectorAll(".tab-pane");
    expect(panes).toHaveLength(1);
    expect(panes[0]!.textContent).toBe("Second pane");
    expect(container.querySelectorAll(".nav-link")[1]!.className).toContain("active");
  });

  it("follows the tabs pattern: roving tabindex, arrow keys, ids linking tab and panel", async () => {
    const selected: number[] = [];
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Tabs);
      b.addAttribute(1, "onSelected", EventCallback.unbound((index: number) => {
        selected.push(index);
      }));
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        for (const [seq, title] of [[0, "One"], [3, "Two"], [6, "Three"]] as const) {
          inner.openComponent(seq, Tab);
          inner.addAttribute(seq + 1, "title", title);
          inner.addAttribute(seq + 2, "childContent", text(`${title} pane`));
          inner.closeComponent();
        }
      });
      b.closeComponent();
    });
    await settle(renderer);
    const tabs = () => [...container.querySelectorAll<HTMLElement>("[role=tab]")];
    expect(tabs().map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    tabs()[0]!.focus();
    tabs()[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle(renderer);
    expect(document.activeElement).toBe(tabs()[2]);
    expect(tabs().map((tab) => tab.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);
    expect(selected).toEqual([2]);
    const panel = container.querySelector<HTMLElement>("[role=tabpanel]")!;
    expect(panel.textContent).toBe("Three pane");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs()[2]!.id);
    expect(tabs()[2]!.getAttribute("aria-controls")).toBe(panel.id);
  });
});

describe("Accordion + AccordionItem", () => {
  it("opens one item at a time", async () => {
    const { container, ...renderer } = await renderTree((b) => {
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

    const buttons = container.querySelectorAll(".accordion-button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.className).not.toContain("collapsed");
    expect(container.querySelectorAll(".accordion-body")).toHaveLength(1);
    expect(container.querySelector(".accordion-body")!.textContent).toBe("Body 0");
    // The Fluent skin's structure: an h3 header whose button controls the open panel, a region labelled by it.
    expect(buttons[0]!.parentElement!.tagName).toBe("H3");
    const panel = document.getElementById(buttons[0]!.getAttribute("aria-controls")!)!;
    expect(panel.getAttribute("role")).toBe("region");
    expect(panel.getAttribute("aria-labelledby")).toBe(buttons[0]!.id);
    expect(buttons[1]!.hasAttribute("aria-controls")).toBe(false);

    buttons[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelectorAll(".accordion-body")).toHaveLength(1);
    expect(container.querySelector(".accordion-body")!.textContent).toBe("Body 1");
    expect(container.querySelectorAll(".accordion-button")[0]!.className).toContain("collapsed");
  });
});

describe("Dropdown + DropdownItem", () => {
  it("toggles the menu, selects an item and closes", async () => {
    let selected = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Dropdown);
      b.addAttribute(1, "label", "Menu");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        inner.openComponent(0, DropdownItem);
        inner.addAttribute(1, "onSelect", EventCallback.unbound(() => {
          selected++;
        }));
        inner.addAttribute(2, "childContent", text("Action"));
        inner.closeComponent();
      });
      b.closeComponent();
    });

    expect(container.querySelector(".dropdown-menu")).toBeNull();
    container.querySelector(".dropdown-toggle")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".dropdown-menu")).not.toBeNull();

    container.querySelector(".dropdown-item")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(selected).toBe(1);
    expect(container.querySelector(".dropdown-menu")).toBeNull();
  });

  it("opens from labelContent — the user's avatar, as MudBlazor's ActivatorContent — named by ariaLabel", async () => {
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Dropdown);
      b.addAttribute(1, "labelContent", (inner: typeof b) => {
        inner.openElement(0, "span");
        inner.addAttribute(1, "class", "avatar");
        inner.addContent(2, "M");
        inner.closeElement();
      });
      b.addAttribute(2, "ariaLabel", "Account of Mukesh");
      b.addAttribute(3, "childContent", (inner: typeof b) => {
        inner.openComponent(0, DropdownItem);
        inner.addAttribute(1, "childContent", text("Logout"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    const toggle = container.querySelector<HTMLElement>(".dropdown-toggle")!;
    expect(toggle.innerHTML).toContain('<span class="avatar">M</span>');
    expect(toggle.getAttribute("aria-label")).toBe("Account of Mukesh");
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".dropdown-menu")!.textContent).toContain("Logout");
  });

  it("follows the menu button pattern: arrow keys open and move, Escape closes and returns focus", async () => {
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Dropdown);
      b.addAttribute(1, "label", "Order");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        for (const [seq, label] of [[0, "Copy"], [2, "Paste"], [4, "Print"]] as const) {
          inner.openComponent(seq, DropdownItem);
          inner.addAttribute(seq + 1, "childContent", text(label));
          inner.closeComponent();
        }
      });
      b.closeComponent();
    });
    const toggle = container.querySelector<HTMLElement>(".dropdown-toggle")!;
    expect(toggle.getAttribute("aria-haspopup")).toBe("menu");
    toggle.focus();
    toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await settle(renderer);
    const menu = container.querySelector<HTMLElement>("[role=menu]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(menu.getAttribute("aria-labelledby")).toBe(toggle.id);
    expect(document.activeElement?.textContent).toBe("Print");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(document.activeElement?.textContent).toBe("Copy");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(renderer);
    expect(container.querySelector("[role=menu]")).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});

describe("Progress", () => {
  it("renders the width style and clamps", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Progress);
      b.addAttribute(1, "value", 250);
      b.addAttribute(2, "striped", true);
      b.addAttribute(3, "intent", "success");
      b.closeComponent();
    });
    const bar = container.querySelector(".progress-bar")!;
    expect(bar.getAttribute("style")!.replace(";", "")).toBe("width: 100%");
    expect(bar.className).toContain("progress-bar-striped");
    expect(bar.className).toContain("bg-success");
    // A progressbar needs a name: without a label, the generic one.
    expect(container.querySelector("[role=progressbar]")!.getAttribute("aria-label")).toBe("Progress");
  });
});

describe("Pagination", () => {
  it("marks the active page and reports changes", async () => {
    let page = 1;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Pagination);
      b.addAttribute(1, "page", page);
      b.addAttribute(2, "pageCount", 3);
      b.addAttribute(3, "onPageChanged", EventCallback.unbound((next: number) => {
        page = next;
      }));
      b.closeComponent();
    });
    await settle(renderer);

    // A named navigation landmark without an ariaLabel too, as the Fluent skin's.
    expect(container.querySelector("nav")!.getAttribute("aria-label")).toBe("Pagination");
    const items = container.querySelectorAll(".page-item");
    expect(items).toHaveLength(5); // prev + 1..3 + next
    expect(items[1]!.className).toContain("active");
    expect(items[0]!.className).toContain("disabled");

    items[2]!.querySelector(".page-link")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(page).toBe(2);
  });
});

describe("Breadcrumb + BreadcrumbItem", () => {
  it("renders links and the active entry", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Breadcrumb);
      b.addAttribute(1, "childContent", (inner: typeof b) => {
        inner.openComponent(0, BreadcrumbItem);
        inner.addAttribute(1, "href", "/home");
        inner.addAttribute(2, "childContent", text("Home"));
        inner.closeComponent();
        inner.openComponent(3, BreadcrumbItem);
        inner.addAttribute(4, "active", true);
        inner.addAttribute(5, "childContent", text("Library"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    const items = container.querySelectorAll(".breadcrumb-item");
    expect(items).toHaveLength(2);
    expect(items[0]!.querySelector("a")!.getAttribute("href")).toBe("/home");
    expect(items[1]!.className).toContain("active");
    expect(items[1]!.getAttribute("aria-current")).toBe("page");
    expect(items[0]!.getAttribute("aria-current")).toBeNull();
    expect(items[1]!.querySelector("a")).toBeNull();
  });

  it("renders an entry with onClick as a button that raises it", async () => {
    let clicks = 0;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, BreadcrumbItem);
      b.addAttribute(1, "onClick", EventCallback.unbound(() => { clicks++; }));
      b.addAttribute(2, "childContent", text("images"));
      b.closeComponent();
    });
    const button = container.querySelector(".breadcrumb-item > button")!;
    expect(button.getAttribute("type")).toBe("button");
    expect(container.querySelector("a")).toBeNull();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(clicks).toBe(1);
  });
});

describe("ListGroup + ListGroupItem", () => {
  it("renders anchors and fires clicks on plain items", async () => {
    let clicked = 0;
    const { container, ...renderer } = await renderTree((b) => {
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
      });
      b.closeComponent();
    });
    // Every item is an <li> of the <ul> (WCAG 1.3.1); links and clickable items hold a real
    // <a>/<button>, so the keyboard reaches them (WCAG 2.1.1).
    const items = container.querySelectorAll(".list-group-item");
    expect(items).toHaveLength(2);
    expect([...items].map((item) => item.tagName)).toEqual(["LI", "LI"]);
    expect([...container.querySelector(".list-group")!.children].every((child) => child.tagName === "LI")).toBe(true);
    expect(items[0]!.className).toContain("active");
    expect(items[0]!.querySelector("a")?.getAttribute("href")).toBe("/one");
    expect(items[0]!.querySelector("a")?.getAttribute("aria-current")).toBe("true");
    const button = items[1]!.querySelector("button")!;
    expect(button.getAttribute("type")).toBe("button");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(clicked).toBe(1);
  });

  it("says its states: active is aria-current on the link, the button or the item; a disabled link goes nowhere", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, ListGroup);
      b.addAttribute(1, "childContent", (inner: typeof b) => {
        inner.openComponent(0, ListGroupItem);
        inner.addAttribute(1, "disabled", true);
        inner.addAttribute(2, "href", "/archive");
        inner.addAttribute(3, "childContent", text("Archive"));
        inner.closeComponent();
        inner.openComponent(4, ListGroupItem);
        inner.addAttribute(5, "active", true);
        inner.addAttribute(6, "onClick", EventCallback.unbound(() => {}));
        inner.addAttribute(7, "childContent", text("Inbox"));
        inner.closeComponent();
        inner.openComponent(8, ListGroupItem);
        inner.addAttribute(9, "active", true);
        inner.addAttribute(10, "disabled", true);
        inner.addAttribute(11, "childContent", text("Drafts"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    const [archive, inbox, drafts] = [...container.querySelectorAll("li")];
    const link = archive!.querySelector("a")!;
    expect(link.hasAttribute("href")).toBe(false);
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(inbox!.querySelector("button")!.getAttribute("aria-current")).toBe("true");
    expect(drafts!.getAttribute("aria-current")).toBe("true");
    expect(drafts!.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Table", () => {
  it("renders the requested modifiers and responsiveness", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Table);
      b.addAttribute(1, "striped", true);
      b.addAttribute(2, "hover", true);
      b.addAttribute(3, "responsive", true);
      b.addAttribute(4, "childContent", (inner: typeof b) => {
        inner.openElement(0, "tbody");
        inner.openElement(1, "tr");
        inner.openElement(2, "td");
        inner.addContent(3, "cell");
        inner.closeElement();
        inner.closeElement();
        inner.closeElement();
      });
      b.closeComponent();
    });
    expect(container.querySelector(".table-responsive")).not.toBeNull();
    const table = container.querySelector(".table")!;
    expect(table.className).toContain("table-striped");
    expect(table.className).toContain("table-hover");
    expect(table.textContent).toContain("cell");
  });

  it("builds one row per item from rowContent, with an empty-state row — the Fluent skin's shape (D6)", async () => {
    const mount = (items: { name: string }[]) =>
      renderTree((b) => {
        b.openComponent(0, Table);
        b.addAttribute(1, "items", items);
        b.addAttribute(2, "small", true);
        b.addAttribute(3, "colSpan", 2);
        b.addAttribute(4, "headerContent", (head: typeof b) => {
          head.openElement(0, "tr");
          head.openElement(1, "th");
          head.addContent(2, "Name");
          head.closeElement();
          head.closeElement();
        });
        b.addAttribute(5, "rowContent", (item: { name: string }) => (row: typeof b) => {
          row.openElement(0, "tr");
          row.openElement(1, "td");
          row.addContent(2, item.name);
          row.closeElement();
          row.closeElement();
        });
        b.closeComponent();
      });
    const { container } = await mount([{ name: "Ada" }, { name: "Linus" }]);
    expect(container.querySelector("table")!.className).toBe("table table-sm");
    expect(container.querySelector("thead th")!.textContent).toBe("Name");
    expect([...container.querySelectorAll("tbody td")].map((td) => td.textContent)).toEqual(["Ada", "Linus"]);
    const empty = (await mount([])).container.querySelector("tbody td")!;
    expect(empty.textContent).toBe("No entries");
    expect(empty.getAttribute("colspan")).toBe("2");
  });
});

describe("Navbar, Spinner, Collapse", () => {
  it("renders brand and variant", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Navbar);
      b.addAttribute(1, "brand", "Tsazor");
      b.addAttribute(2, "childContent", text("nav"));
      b.closeComponent();
    });
    expect(container.querySelector(".navbar-brand")!.textContent).toBe("Tsazor");
    expect(container.querySelector(".navbar")!.className).toContain("bg-body-tertiary");
    expect(container.querySelector(".navbar")!.getAttribute("data-bs-theme")).toBe("light");
  });

  it("renders the spinner variant", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Spinner);
      b.addAttribute(1, "intent", "danger");
      b.addAttribute(2, "kind", "grow");
      b.closeComponent();
    });
    // The status region announces its hidden text (not an aria-label); the animated element is decoration.
    const status = container.querySelector('[role="status"]')!;
    expect(status.hasAttribute("aria-label")).toBe(false);
    expect(status.querySelector(".visually-hidden")!.textContent).toBe("Loading…");
    expect(status.querySelector(".spinner-grow")!.className).toBe("spinner-grow text-danger");
    expect(status.querySelector(".spinner-grow")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("collapses and expands", async () => {
    let open = false;
    const { container, rerender, ...renderer } = await renderTree((b) => {
      b.openComponent(0, Collapse);
      b.addAttribute(1, "isOpen", open);
      b.addAttribute(2, "childContent", text("Hidden"));
      b.closeComponent();
    });
    expect(container.querySelector(".collapse")).toBeNull();
    open = true;
    await rerender();
    expect(container.querySelector(".collapse")!.textContent).toBe("Hidden");
  });
});
describe("callbacks are awaited (Blazor: await OnClick.InvokeAsync)", () => {
  it("a Button waits for an async onClick, and its failure reaches the ErrorBoundary", async () => {
    let finished = false;
    const { container, ...renderer } = await renderTree((b) => {
      b.openComponent(0, ErrorBoundary);
      b.addAttribute(1, "childContent", ((inner) => {
        inner.openComponent(0, Button);
        inner.addAttribute(1, "childContent", text("Save"));
        inner.addAttribute(2, "onClick", EventCallback.unbound(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          finished = true;
          throw new Error("save failed");
        }));
        inner.closeComponent();
      }) as RenderFragment);
      b.addAttribute(2, "errorContent", ((error: unknown) => (inner) => inner.addContent(0, `caught: ${(error as Error).message}`)) as unknown as RenderFragment);
      b.closeComponent();
    });
    container.querySelector("button")!.click();
    // The renderer tracks the click until the handler is done (render().click() in tests waits on this).
    await renderer.settle();
    expect(finished).toBe(true);
    expect(container.textContent).toBe("caught: save failed");
  });
});

describe("Button with href", () => {
  it("is a link that looks like the button; disabled, it has no href", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "href", "/admin/roles?viewName=Create%20Role");
      b.addAttribute(2, "intent", "primary");
      b.addAttribute(3, "childContent", text("Add Role"));
      b.closeComponent();
      b.openComponent(4, Button);
      b.addAttribute(5, "href", "/elsewhere");
      b.addAttribute(6, "disabled", true);
      b.addAttribute(7, "childContent", text("Off"));
      b.closeComponent();
    });
    const [link, off] = [...container.querySelectorAll("a")];
    expect(container.querySelector("button")).toBeNull();
    expect(link!.getAttribute("href")).toBe("/admin/roles?viewName=Create%20Role");
    expect(link!.className).toContain("btn");
    expect(link!.textContent).toBe("Add Role");
    expect(off!.hasAttribute("href")).toBe(false);
    expect(off!.getAttribute("aria-disabled")).toBe("true");
  });
});

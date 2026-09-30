/**
 * @tsazor/components behavioral tests: every component renders through the
 * real compiled pipeline (dist/*.js built by build.mjs from the .tsazor
 * sources) and mounts via @tsazor/testing's happy-dom renderer.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type RenderFragment } from "@tsazor/runtime";
import {
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
async function settle(renderer: Awaited<ReturnType<typeof renderTree>>["renderer"]): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

describe("Button", () => {
  it("renders variant classes and fires onClick", async () => {
    let clicks = 0;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Button);
      b.addAttribute(1, "variant", "success");
      b.addAttribute(2, "outline", true);
      b.addAttribute(3, "size", "lg");
      b.addAttribute(4, "childContent", text("Go"));
      b.addAttribute(5, "onClick", () => {
        clicks++;
      });
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

describe("Badge", () => {
  it("renders the variant and pill shape", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Badge);
      b.addAttribute(1, "variant", "danger");
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
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Alert);
      b.addAttribute(1, "variant", "warning");
      b.addAttribute(2, "dismissible", true);
      b.addAttribute(3, "onDismissed", () => {
        dismissed++;
      });
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
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Modal);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "title", "Confirm");
      b.addAttribute(3, "onClosed", () => {
        closed++;
      });
      b.addAttribute(4, "childContent", text("Sure?"));
      b.closeComponent();
    });
    expect(container.querySelector(".modal-title")!.textContent).toBe("Confirm");
    expect(container.querySelector(".modal-body")!.textContent).toBe("Sure?");
    expect(container.querySelector(".modal-backdrop")).not.toBeNull();
    container.querySelector(".btn-close")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(closed).toBe(1);
  });

  it("does not close when the dialog body is clicked", async () => {
    let closed = 0;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Modal);
      b.addAttribute(1, "isOpen", true);
      b.addAttribute(2, "onClosed", () => {
        closed++;
      });
      b.addAttribute(3, "childContent", text("Body"));
      b.closeComponent();
    });
    container.querySelector(".modal-body")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(closed).toBe(0);
  });
});

describe("Tabs + Tab", () => {
  function build(b: ReturnType<typeof Object.getPrototypeOf> & never): void {
    throw new Error("unused");
  }

  it("renders the nav after registration and switches panes on click", async () => {
    const { container, renderer } = await renderTree((b) => {
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
});

describe("Accordion + AccordionItem", () => {
  it("opens one item at a time", async () => {
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

    const buttons = container.querySelectorAll(".accordion-button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.className).not.toContain("collapsed");
    expect(container.querySelectorAll(".accordion-body")).toHaveLength(1);
    expect(container.querySelector(".accordion-body")!.textContent).toBe("Body 0");

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
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Dropdown);
      b.addAttribute(1, "label", "Menu");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        inner.openComponent(0, DropdownItem);
        inner.addAttribute(1, "onSelect", () => {
          selected++;
        });
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
});

describe("Progress", () => {
  it("renders the width style and clamps", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Progress);
      b.addAttribute(1, "value", 250);
      b.addAttribute(2, "striped", true);
      b.addAttribute(3, "variant", "success");
      b.closeComponent();
    });
    const bar = container.querySelector(".progress-bar")!;
    expect(bar.getAttribute("style")!.replace(";", "")).toBe("width: 100%");
    expect(bar.className).toContain("progress-bar-striped");
    expect(bar.className).toContain("bg-success");
  });
});

describe("Pagination", () => {
  it("marks the active page and reports changes", async () => {
    let page = 1;
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Pagination);
      b.addAttribute(1, "page", page);
      b.addAttribute(2, "pageCount", 3);
      b.addAttribute(3, "onPageChanged", (next: number) => {
        page = next;
      });
      b.closeComponent();
    });
    await settle(renderer);

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
    expect(items[1]!.querySelector("a")).toBeNull();
  });
});

describe("ListGroup + ListGroupItem", () => {
  it("renders anchors and fires clicks on plain items", async () => {
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
        inner.addAttribute(5, "onClick", () => {
          clicked++;
        });
        inner.addAttribute(6, "childContent", text("Two"));
        inner.closeComponent();
      });
      b.closeComponent();
    });
    const items = container.querySelectorAll(".list-group-item");
    expect(items).toHaveLength(2);
    expect(items[0]!.tagName).toBe("A");
    expect(items[0]!.className).toContain("active");
    items[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(renderer);
    expect(clicked).toBe(1);
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
    expect(container.querySelector(".navbar")!.className).toContain("navbar-light");
  });

  it("renders the spinner variant", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, Spinner);
      b.addAttribute(1, "variant", "danger");
      b.addAttribute(2, "kind", "grow");
      b.closeComponent();
    });
    const spinner = container.querySelector('[role="status"]')!;
    expect(spinner.className).toBe("spinner-grow text-danger");
  });

  it("collapses and expands", async () => {
    let open = false;
    const { container, renderer, rerender } = await renderTree((b) => {
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
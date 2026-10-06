/**
 * `<Await>` (Tsazor extension; Blazor has no counterpart) through the real
 * compiler pipeline: `<Pending>` / `<Then Context=…>` / `<Catch Context=…>`
 * are child content elements of the built-in component (2.3 slots).
 *
 * The page awaits a promise the test controls (`globalThis.__awaitUser`).
 * `mount` settles through waitUntilIdle, which waits for the pending promise
 * — so the test inspects the Pending state before it settles the promise.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnosticsOf, mount } from "../harness.js";

const page = (catchSlot = true): string => `<Await For="@user">
    <Pending><p class="pending">Loading…</p></Pending>
    <Then Context="u"><p class="then">Hello @u.name</p></Then>${catchSlot ? `
    <Catch Context="err"><p class="catch">Failed: @err.message</p></Catch>` : ""}
</Await>
@code {
    user = (globalThis as unknown as { __awaitUser: Promise<{ name: string }> }).__awaitUser;
}`;

type Global = { __awaitUser?: Promise<{ name: string }> };

function controlled(): { resolve: (user: { name: string }) => void; reject: (error: unknown) => void } {
  let resolve!: (user: { name: string }) => void;
  let reject!: (error: unknown) => void;
  (globalThis as Global).__awaitUser = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject };
}

/** Lets the compile and the first render run without waiting for the promise. */
async function untilRendered(selector: string): Promise<Element> {
  for (let i = 0; i < 200; i++) {
    const found = document.body.querySelector(selector);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${selector} never rendered`);
}

afterEach(() => {
  delete (globalThis as Global).__awaitUser;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("<Await> in markup", () => {
  it("compiles Pending / Then / Catch as slots without diagnostics", async () => {
    expect(await diagnosticsOf(page())).toEqual([]);
  });

  it("renders Pending, then Then with the context", async () => {
    const control = controlled();
    const mounting = mount(page());
    expect((await untilRendered(".pending")).textContent).toBe("Loading…");
    control.resolve({ name: "Ada" });
    const m = await mounting;
    expect(m.html()).toBe('<p class="then">Hello Ada</p>');
  });

  it("renders Catch with the rejection reason", async () => {
    const control = controlled();
    const mounting = mount(page());
    await untilRendered(".pending");
    control.reject(new Error("offline"));
    const m = await mounting;
    expect(m.html()).toBe('<p class="catch">Failed: offline</p>');
  });

  it("without Catch, a rejection is a component failure an ErrorBoundary shows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const control = controlled();
    const mounting = mount({
      "Test.tsazor": `<ErrorBoundary>
    <ChildContent><Profile /></ChildContent>
    <ErrorContent Context="problem"><p class="boundary">@problem.message</p></ErrorContent>
</ErrorBoundary>`,
      "Profile.tsazor": page(false),
    });
    await untilRendered(".pending");
    control.reject(new Error("no user"));
    const m = await mounting;
    expect(m.html()).toBe('<p class="boundary">no user</p>');
  });

  it("an unknown slot name is TZS025 (complete metadata)", async () => {
    const diagnostics = await diagnosticsOf(`<Await For="@(1)"><Done>x</Done></Await>`);
    expect(diagnostics.map((d) => d.code)).toContain("TZS025");
  });
});

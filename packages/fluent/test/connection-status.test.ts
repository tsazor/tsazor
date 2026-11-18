/**
 * ConnectionStatus: the app's ConnectionState (or its own `state`) as a status region with the phase's text and
 * color; a change re-renders it.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { ConnectionState } from "@tsazor/runtime";
import { ConnectionStatus } from "../dist/index.js";

describe("ConnectionStatus", () => {
  it("shows the phase of its state, as a status region, and follows its changes", async () => {
    const state = new ConnectionState();
    const result = await renderTree((b) => {
      b.openComponent(0, ConnectionStatus);
      b.addAttribute(1, "state", state);
      b.closeComponent();
    });
    await result.settle();
    const status = () => result.container.querySelector<HTMLElement>("[role=status]")!;
    expect([status().getAttribute("aria-label"), status().textContent]).toEqual(["Connection", "Connecting…"]);
    state.report("open");
    await result.settle();
    expect(status().textContent).toBe("Live");
    expect(status().className).toContain("--open");
    state.report("closed");
    await result.settle();
    expect(status().textContent).toBe("Disconnected");
    result.dispose();
  });

  it("shows the app's ConnectionState without a state of its own", async () => {
    const result = await renderTree((b) => {
      b.openComponent(0, ConnectionStatus);
      b.closeComponent();
    });
    await result.settle();
    expect(result.container.querySelector("[role=status]")!.textContent).toBe("Connecting…");
    result.dispose();
  });
});

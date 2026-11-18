/**
 * ConnectionState: a live connection's phase, reported by any transport; a change notifies (with `reconnected` when
 * it comes back), a component that injects it renders again; trackEventSource reports an EventSource's phase.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, ConnectionState, inject, ServiceCollection, trackEventSource, type ConnectionChange, type RenderTreeBuilder } from "../src/index";
import { Renderer } from "../src/internal";

describe("ConnectionState", () => {
  it("notifies a change once, and says when it reconnected", () => {
    const state = new ConnectionState();
    const changes: ConnectionChange[] = [];
    state.subscribe((change) => changes.push(change));
    state.report("open");
    state.report("open");
    state.report("reconnecting");
    state.report("open");
    expect(changes).toEqual([
      { previous: "connecting", phase: "open", reconnected: false },
      { previous: "open", phase: "reconnecting", reconnected: false },
      { previous: "reconnecting", phase: "open", reconnected: true },
    ]);
    expect([state.phase, state.isOpen, state.lastChange instanceof Date]).toEqual(["open", true, true]);
  });

  it("re-renders a component that injects it", async () => {
    const state = new ConnectionState();
    class Header extends ComponentBase {
      readonly connection = inject(ConnectionState);
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, this.connection.phase);
      }
    }
    const services = new ServiceCollection();
    services.registerValue(ConnectionState, state);
    const renderer = new Renderer(services.build());
    const container = document.createElement("div");
    renderer.renderInContainer(Header, container);
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("connecting");
    state.report("open");
    await renderer.waitUntilIdle();
    expect(container.textContent).toBe("open");
  });
});

describe("trackEventSource", () => {
  class FakeEventSource extends EventTarget {
    readyState = 0;
    to(readyState: number, event: "open" | "error"): void {
      this.readyState = readyState;
      this.dispatchEvent(new Event(event));
    }
  }

  it("connecting until open; reconnecting after a drop; closed when the browser gives up", () => {
    const state = new ConnectionState();
    const source = new FakeEventSource();
    const stop = trackEventSource(state, source as unknown as EventSource);
    source.to(0, "error"); // a retry before it ever opened
    expect(state.phase).toBe("connecting");
    source.to(1, "open");
    expect(state.phase).toBe("open");
    source.to(0, "error");
    expect(state.phase).toBe("reconnecting");
    source.to(2, "error");
    expect(state.phase).toBe("closed");
    stop();
    source.to(1, "open");
    expect(state.phase).toBe("closed");
  });
});

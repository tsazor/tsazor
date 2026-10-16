/**
 * The chat's state (design-extended-library.md §2.3): the messages, the
 * streaming draft (deltas, done, empty), the no-double-stream guard, clear.
 */
import { describe, expect, it, vi } from "vitest";
import { ChatState, ChatStream, type ChatMessage } from "../src/index";

describe("ChatState", () => {
  it("appends messages and re-renders the chat", () => {
    const onChange = vi.fn();
    const state = new ChatState(onChange);
    expect(state.messages).toHaveLength(0);
    state.append({ role: "user", text: "Hi" });
    expect(state.messages).toHaveLength(1);
    expect(state.streaming).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("streams a draft: deltas grow it, done closes, an empty draft leaves nothing", () => {
    const onChange = vi.fn();
    const state = new ChatState(onChange);
    state.append({ role: "user", text: "Hi" });
    const stream = state.beginStream();
    expect(state.streaming).toBe(true);
    expect(state.messages).toHaveLength(2);
    stream.append("Hel");
    stream.append("lo.");
    expect(state.messages[1]!.text).toBe("Hello.");
    stream.done();
    expect(state.streaming).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(5); // append, beginStream, two deltas, done
    expect(state.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(state.messages[1]!.text).toBe("Hello.");
  });

  it("rejects a second stream while one runs", () => {
    const state = new ChatState(() => undefined);
    state.append({ role: "user", text: "Hi" });
    state.beginStream();
    expect(() => state.beginStream()).toThrow(/already streaming/);
    new ChatStream(state);
    void 0;
  });

  it("clears while streaming: the draft goes, too", () => {
    const state = new ChatState(() => undefined);
    state.append({ role: "user", text: "Hi" });
    const stream = state.beginStream();
    stream.append("part");
    state.clear();
    expect(state.messages).toHaveLength(0);
    expect(state.streaming).toBe(false);
  });

  it("re-feeds messages by identity (the app's re-load)", () => {
    const state = new ChatState(() => undefined);
    const messages: ChatMessage[] = [{ role: "user", text: "Hi" }];
    state.setMessages(messages);
    expect(state.setMessages(messages)).toBe(false);
    expect(state.messages).toBe(messages);
  });
});
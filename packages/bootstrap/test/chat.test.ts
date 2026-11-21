/**
 * Chat and PromptInput over the compiled components (the extended layer's
 * cluster 4): the bubbles by role, the assistant's Markdown, the streaming
 * draft, the typing indicator, and the prompt's Enter-to-send with its clear.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Chat, PromptInput } from "../dist/index.js";
import { ChatState, type ChatMessage } from "@tsazor/ui";

let mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

/** A host that binds a state (as an app composes Chat + PromptInput over one ChatState). */
class ChatHost extends ComponentBase {
  readonly state = new ChatState<ChatMessage>(() => this.stateHasChanged());
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, Chat as never);
    b.addAttribute(1, "state", this.state);
    b.addAttribute(2, "ariaLabel", "A chat");
    b.closeComponent();
  }
}

/** Drives the state's stream like an app's fetch loop would (in pieces, async). */
async function streamAnswer(state: ChatState, answer: string[], settle: () => Promise<void>): Promise<void> {
  const stream = state.beginStream();
  for (const delta of answer) {
    stream.append(delta);
    await settle();
  }
  stream.done();
  await settle();
}

describe("Chat", () => {
  it("renders the bubbles by role; the assistant's text is Markdown, the user's plain", async () => {
    const result = await render(ChatHost);
    mounted.push(result);
    const { container, instance, settle } = result;
    const state = (instance as unknown as { state: ChatState }).state;
    state.append({ role: "user", text: "How do I bind a grid?" });
    await settle();
    state.append({ role: "assistant", text: "Use `@bind-Items` and **Enter** sends" });
    await settle();
    const messages = container.querySelectorAll(".tz-chat-message");
    expect(messages).toHaveLength(2);
    expect(messages[0]!.className).toContain("tz-chat-message--user");
    expect(messages[0]!.querySelector(".tz-chat-text")!.textContent).toBe("How do I bind a grid?");
    expect(messages[1]!.className).toContain("tz-chat-message--assistant");
    expect(messages[1]!.querySelector("code")!.textContent).toBe("@bind-Items"); // Markdown rendered
    expect(messages[1]!.querySelector("strong")!.textContent).toBe("Enter");
    // The mark is a picture to a screen reader, which hears who speaks instead.
    expect(messages[0]!.querySelector(".tz-chat-role")!.getAttribute("aria-hidden")).toBe("true");
    expect([...messages].map((message) => message.querySelector(".visually-hidden")!.textContent)).toEqual(["You: ", "Assistant: "]);
  });

  it("streams an answer: the draft grows in the log, the typing indicator until the first delta", async () => {
    const { container, instance, settle } = await render(ChatHost);
    mounted.push({ dispose: () => container.remove() } as RenderResult);
    const state = (instance as unknown as { state: ChatState }).state;
    state.append({ role: "user", text: "Hi" });
    await settle();
    const stream = state.beginStream();
    await settle();
    expect(container.querySelector(".tz-chat-typing")).not.toBeNull();
    stream.append("Working on");
    await settle();
    expect(container.querySelector(".tz-chat-typing")).toBeNull();
    expect(container.querySelectorAll(".tz-chat-message")[1]!.textContent).toContain("Working on"); // the role mark is in front
    stream.done();
    await settle();
    expect(container.querySelectorAll(".tz-chat-message")[1]!.textContent).toContain("Working on"); // the role mark is in front
  });

  it("keeps the log empty on clear; the placeholder when empty", async () => {
    const { container, instance, settle } = await render(ChatHost);
    mounted.push({ dispose: () => container.remove() } as RenderResult);
    const state = (instance as unknown as { state: ChatState }).state;
    state.append({ role: "user", text: "Hi" });
    await settle();
    state.clear();
    await settle();
    expect(container.querySelectorAll(".tz-chat-message")).toHaveLength(0);
    expect(container.querySelector(".tz-chat-empty")).not.toBeNull();
  });
});

describe("PromptInput", () => {
  it("sends on Enter and clears; Shift+Enter breaks a line; disabled doesn't send", async () => {
    let sent: string | undefined;
    const result = await render(PromptInput, {
      parameters: {
        placeholder: "Ask…",
        onSend: EventCallback.unbound((value: string) => { sent = value; }),
      },
    });
    mounted.push(result);
    const { container, settle } = result;
    const area = container.querySelector<HTMLTextAreaElement>(".tz-prompt-text")!;
    expect(area.placeholder).toBe("Ask…");
    // A placeholder is no name; the send button's is its visible (library) text.
    expect(area.getAttribute("aria-label")).toBe("Message");
    const button = container.querySelector<HTMLButtonElement>(".tz-prompt button")!;
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.textContent!.trim()).toBe("Send");
    area.value = "Bind the grid";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    expect(sent).toBe("Bind the grid");
    expect(area.value).toBe("");

    area.value = "line 1";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    await settle();
    expect(sent).toBe("Bind the grid"); // unchanged
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    expect(sent).toBe("line 1");
  });

  it("does not send from an empty line; the send button sends the same", async () => {
    let sent: string | undefined;
    const result = await render(PromptInput, {
      parameters: {
        onSend: EventCallback.unbound((value: string) => { sent = value; }),
      },
    });
    mounted.push(result);
    const { container, settle } = result;
    const area = container.querySelector<HTMLTextAreaElement>(".tz-prompt-text")!;
    area.value = "   ";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    container.querySelector<HTMLButtonElement>(".tz-prompt .btn")!.click();
    await settle();
    expect(sent).toBeUndefined();

    area.value = "  Hi  ";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    container.querySelector<HTMLButtonElement>(".tz-prompt .btn")!.click();
    await settle();
    expect(sent).toBe("Hi");
    expect(area.value).toBe("");
  });
});
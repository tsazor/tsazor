/**
 * The chat's state (design-extended-library.md §2.3): its messages, the streaming draft, and a
 * selection-free, provider-free face — the model opens no connection and holds no key; the app
 * feeds the deltas from its own `fetch` or SDK, and aborts on its own `AbortSignal`. The DOM
 * lives in the skins; the state is testable headless.
 */

/** One message of a chat: a role's text ( Markdown shapes the assistant's by default). */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  /** The text, streamed or complete. */
  text: string;
}

/**
 * One streaming answer: the app grows the draft's text by its deltas and closes it. Keep the
 * writer's calls synchronous and in order (a `for await` over the app's stream reads well);
 * `abort()` closes with the partial text left in place.
 */
export class ChatStream {
  private state: ChatState;
  private closed = false;

  constructor(state: ChatState) {
    this.state = state;
  }

  /** Appends the stream's next delta (a text piece). */
  append(delta: string): void {
    this.state.appendDelta(this, delta);
  }

  /** Finishes: the draft is a message. An already closed stream does nothing. */
  done(): void {
    if (this.closed) return;
    this.closed = true;
    this.state.endStream(this);
  }

  /** Closes without finishing: the partial text stays, the chat stops streaming. */
  abort(): void {
    this.done();
  }

  /** The streamed text so far. */
  get text(): string {
    return this.state.streamText(this);
  }
}

/**
 * The chat's state: its messages and its streaming draft. A skin's Chat renders it (the list's
 * virtualization pinned to the bottom does the scroll); `onChange` asks it to render again.
 */
export class ChatState<TMessage extends ChatMessage = ChatMessage> {
  private store: readonly TMessage[] = [];
  /** The streaming draft's index in the messages and its writer's state. */
  private stream: { index: number } | undefined;
  private streamingNow = false;

  constructor(private readonly onChange: () => void) {}

  /** The messages, the streaming draft included while it runs. */
  get messages(): readonly TMessage[] {
    return this.store;
  }

  /** Whether an answer is streaming now (the input's disabled and the indicator read it). */
  get streaming(): boolean {
    return this.streamingNow;
  }

  /** Appends a message (the user's send, or the app seeding history); the chat renders it. */
  append(message: TMessage): void {
    this.store = [...this.store, message];
    this.onChange();
  }

  /** Replaces the messages (the app re-fed after its own history load); compared by identity; true when it changed. */
  setMessages(messages: readonly TMessage[] | undefined): boolean {
    if (messages === this.store) return false;
    this.store = messages ?? [];
    return true;
  }

  /** Begins a streaming assistant's answer: the chat holds a draft message and streams into it. */
  beginStream(): ChatStream {
    if (this.streamingNow) throw new Error("ChatState: an answer is already streaming — close it first.");
    const draft = { role: "assistant", text: "" } as TMessage;
    this.store = [...this.store, draft];
    this.stream = { index: this.store.length - 1 };
    this.streamingNow = true;
    this.onChange();
    return new ChatStream(this);
  }

  /** The stream's text so far (its last message's). */
  streamText(stream: ChatStream): string {
    if (this.stream === undefined) return "";
    void stream;
    return this.store[this.stream.index]?.text ?? "";
  }

  /** @internal A delta grows the draft's text. */
  appendDelta(stream: ChatStream, delta: string): void {
    if (this.stream === undefined || this.streamingNow === false) return;
    void stream;
    const index = this.stream.index;
    const current = this.store[index];
    if (current === undefined) return;
    const next = [...this.store];
    next[index] = { ...current, text: (current.text ?? "") + delta };
    this.store = next;
    this.onChange();
  }

  /** @internal Closes the stream; the empty draft (nothing streamed) leaves the messages. */
  endStream(stream: ChatStream): void {
    void stream;
    this.streamingNow = false;
    if (this.stream === undefined) return;
    const draft = this.store[this.stream.index];
    this.stream = undefined;
    if (draft !== undefined && draft.text === "") {
      this.store = this.store.slice(0, -1);
    }
    this.onChange();
  }

  /** Clears the messages; a running stream is closed first (its partial text goes too). */
  clear(): void {
    if (this.streamingNow) {
      this.streamingNow = false;
      this.stream = undefined;
    }
    this.store = [];
    this.onChange();
  }
}
import type { ComponentBase } from "./component-base.js";

/**
 * Blazor's EventCallback: binds a handler to its owning component. The
 * renderer re-renders the owner after the handler completes (Blazor
 * semantics), so handlers only need to mutate state.
 */
export class EventCallback<TArg = unknown> {
  private constructor(
    private readonly receiver: ComponentBase | null,
    private readonly delegate: ((arg: TArg) => unknown) | null,
  ) {}

  /** Creates a callback whose owner re-renders after invocation. The delegate
   *  may return anything — only a returned Promise is awaited — so expression
   *  lambdas like `@onclick="() => count++"` type-check (C#: an Action accepts
   *  a statement expression). Accepts an
   *  already-bound callback as the delegate too: the compiler wraps every
   *  EventCallback parameter value and event handler in `bind` without knowing
   *  whether the expression already is an EventCallback (a forwarded
   *  `OnClick="@OnClick"`, a field `submit = EventCallback.bind(this, …)`
   *  referenced by `@onclick`) — it passes through unchanged, keeping its own
   *  receiver (Blazor's `EventCallbackFactory.Create(receiver, callback)`). */
  static bind<TArg>(
    receiver: ComponentBase,
    delegate: ((arg: TArg) => unknown) | EventCallback<TArg>,
  ): EventCallback<TArg> {
    if (delegate instanceof EventCallback) return delegate;
    return new EventCallback(receiver, delegate);
  }

  /** Creates a callback without an owning component (no auto re-render). */
  static unbound<TArg>(delegate: (arg: TArg) => unknown): EventCallback<TArg> {
    return new EventCallback(null, delegate);
  }

  /** Blazor's EventCallback.Empty equivalent. */
  static get empty(): EventCallback<never> {
    return new EventCallback<never>(null, null);
  }

  /**
   * Blazor's `EventCallback<T>.InvokeAsync(T)` — and, for a plain
   * `EventCallback` (`TArg` = `unknown`), the argument-less
   * `EventCallback.InvokeAsync()`.
   */
  async invokeAsync(...args: unknown extends TArg ? [arg?: TArg] : [arg: TArg]): Promise<void> {
    const arg = args[0] as TArg;
    if (this.delegate === null) return;
    // Call with the receiver as `this` (Blazor's Factory.Bind semantics): the
    // compiler passes method references like `this.incrementCount`, which are
    // not bound — without this, `this.state` inside the handler is undefined.
    const result = this.delegate.call(this.receiver, arg);
    // Blazor's ComponentBase.HandleEventAsync: the owning component re-renders
    // after the handler's synchronous part — so `busy = true; await …` shows
    // its intermediate state — and, for an async handler, again once it
    // completes (CallStateHasChangedOnAsyncCompletion). A failed async handler
    // does not re-render a second time; its error propagates.
    this.receiver?.stateHasChangedInternal();
    if (result instanceof Promise) {
      await result;
      this.receiver?.stateHasChangedInternal();
    }
  }

  get hasDelegate(): boolean {
    return this.delegate !== null;
  }

  /**
   * Blazor's EventCallback.Equals: same receiver and same delegate (a
   * forwarded EventCallback passes through `bind` as the same instance).
   * Used by the diff to skip listener rebinds and by parameter change
   * detection.
   */
  equals(other: EventCallback<never>): boolean {
    return this.receiver === other.receiver && this.delegate === other.delegate;
  }
}
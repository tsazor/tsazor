import type { ComponentBase } from "./component-base.js";

/**
 * Blazor's EventCallback: binds a handler to its owning component. The
 * renderer re-renders the owner after the handler completes (Blazor
 * semantics), so handlers only need to mutate state.
 */
export class EventCallback<TArg = unknown> {
  private constructor(
    private readonly receiver: ComponentBase | null,
    private readonly delegate: ((arg: TArg) => void | Promise<void>) | EventCallback<TArg> | null,
  ) {}

  /** Creates a callback whose owner re-renders after invocation. Accepts an
   *  already-bound callback as the delegate too: the compiler wraps every on*-
   *  named attribute value in `bind` without knowing whether the referenced
   *  member already holds an EventCallback (e.g. a field like
   *  `submit = EventCallback.bind(this, …)` referenced by `@onclick`). Without
   *  the unwrapping below, invokeAsync would call an object like a function. */
  static bind<TArg>(
    receiver: ComponentBase,
    delegate: ((arg: TArg) => void | Promise<void>) | EventCallback<TArg>,
  ): EventCallback<TArg> {
    return new EventCallback(receiver, delegate);
  }

  /** Creates a callback without an owning component (no auto re-render). */
  static unbound<TArg>(delegate: (arg: TArg) => void | Promise<void>): EventCallback<TArg> {
    return new EventCallback(null, delegate);
  }

  /** Blazor's EventCallback.Empty equivalent. */
  static get empty(): EventCallback<never> {
    return new EventCallback<never>(null, null);
  }

  async invokeAsync(arg: TArg): Promise<void> {
    if (this.delegate === null) return;
    // Re-wrapped callback: invoke it directly — it binds to its own receiver
    // and re-renders after running, so forwarding keeps the semantics intact.
    if (this.delegate instanceof EventCallback) {
      await this.delegate.invokeAsync(arg);
      return;
    }
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
   * Blazor's EventCallback.Equals: same receiver and same delegate. A
   * re-wrapped callback compares its inner callback the same way (the
   * compiler re-binds a forwarded EventCallback on every render). Used by the
   * diff to skip listener rebinds and by parameter change detection.
   */
  equals(other: EventCallback<never>): boolean {
    if (this.receiver !== other.receiver) return false;
    if (this.delegate === other.delegate) return true;
    return this.delegate instanceof EventCallback && other.delegate instanceof EventCallback && this.delegate.equals(other.delegate as EventCallback<never>);
  }
}
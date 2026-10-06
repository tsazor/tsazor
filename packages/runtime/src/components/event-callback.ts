import type { ComponentBase } from "./component-base.js";

/**
 * Blazor's EventCallback: binds a handler to its owning component. The
 * renderer re-renders the owner after the handler completes (Blazor
 * semantics), so handlers only need to mutate state.
 */
export class EventCallback<TArg = unknown> {
  private constructor(
    private readonly receiver: ComponentBase | null,
    /** The handler; for a `bindWith` callback created on first use. */
    private delegate: ((arg: TArg) => unknown) | null,
    /** `bindWith`: the stable function that creates the handler, and its arguments. */
    private readonly factory: ((...args: never[]) => (arg: TArg) => unknown) | null = null,
    private readonly args: readonly unknown[] = NO_ARGS,
  ) {}

  /**
   * @internal Compiler API (render hints, H1 — docs/design-render-hints.md).
   * A callback whose handler is `factory.apply(receiver, args)`, created on
   * first use: the compiler hoists an event-handler lambda into a method of
   * the component (`__tsazor_h0(row) { return (e) => this.select(e, row); }`)
   * and binds the render-time values it captures as `args`. Two such
   * callbacks are equal when receiver, factory and every argument are the
   * same (`Object.is`) — the same behavior — so re-rendering an unchanged
   * row swaps no handler. Invocation is that of `bind`.
   */
  static bindWith<TArg>(
    receiver: ComponentBase,
    factory: (...args: never[]) => (arg: TArg) => unknown,
    args: readonly unknown[],
  ): EventCallback<TArg> {
    return new EventCallback<TArg>(receiver, null, factory, args);
  }

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
    const delegate = this.delegate ?? this.createDelegate();
    if (delegate === null) return;
    // Call with the receiver as `this` (Blazor's Factory.Bind semantics): the
    // compiler passes method references like `this.incrementCount`, which are
    // not bound — without this, `this.state` inside the handler is undefined.
    const result = delegate.call(this.receiver, arg);
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

  /** Blazor's EventCallback.HasDelegate: false for `EventCallback.empty`, whose invocation does nothing. */
  get hasDelegate(): boolean {
    return this.delegate !== null || this.factory !== null;
  }

  /**
   * Blazor's EventCallback.Equals: same receiver and same delegate (a
   * forwarded EventCallback passes through `bind` as the same instance);
   * `bindWith` callbacks: same receiver, factory and arguments.
   * Used by the diff to skip listener rebinds and by parameter change
   * detection.
   */
  equals(other: EventCallback<never>): boolean {
    if (this.receiver !== other.receiver) return false;
    if (this.factory === null || other.factory === null) {
      return this.factory === other.factory && this.delegate === other.delegate;
    }
    if (this.factory !== other.factory) return false;
    const args = this.args;
    const otherArgs = other.args;
    if (args.length !== otherArgs.length) return false;
    for (let i = 0; i < args.length; i++) if (!Object.is(args[i], otherArgs[i])) return false;
    return true;
  }

  /**
   * @internal Equality as Blazor's parameter change detection sees it
   * (`Delegate.Equals`: target and method). A lambda that captures locals is
   * a new closure object in C# every render — a different target — so a
   * hoisted callback with arguments always counts as changed there: a child
   * component re-renders with its parent exactly as in Blazor. The DOM diff
   * uses `equals` (invisible: the same handler behavior).
   */
  equalsAsParameter(other: EventCallback<never>): boolean {
    if (this.args.length > 0 || other.args.length > 0) return false;
    return this.equals(other);
  }

  /** `bindWith`: creates the handler once, with the receiver as `this`. */
  private createDelegate(): ((arg: TArg) => unknown) | null {
    if (this.factory === null) return null;
    this.delegate = (this.factory as (...args: unknown[]) => (arg: TArg) => unknown).apply(this.receiver, this.args as unknown[]);
    return this.delegate;
  }
}

const NO_ARGS: readonly unknown[] = [];
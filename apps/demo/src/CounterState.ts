/**
 * App-wide counter state (Blazor: a service registered with AddSingleton /
 * AddScoped). Pages are disposed when the router leaves them, so state that
 * must survive navigation lives in a service, not in a component field.
 */
export class CounterState {
  count = 0;

  increment(): void {
    this.count++;
  }
}

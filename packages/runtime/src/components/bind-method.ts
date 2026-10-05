/** receiver → method → bound function; weak on both levels. */
const cache = new WeakMap<object, WeakMap<Function, Function>>();

/**
 * Razor's delegate conversion for generated code: a method group in markup
 * (`Filter="isVisible"`, `OnClick="item.toggle"`) becomes a function bound to
 * its receiver, like a C# delegate (target + method).
 *
 * The bound function is cached per (receiver, method): the same pair yields
 * the identical function on every render, so a child sees an unchanged
 * reference (identity and equality hold — `===`, Set/Map keys,
 * `removeEventListener`, and an EventCallback wrapping it compares equal).
 * Both levels are weak: the cache keeps neither receivers nor methods alive.
 * A primitive receiver (`"abc".at`) cannot key a WeakMap and is bound anew.
 * A `method` that is not a function is returned unchanged.
 */
export function bindMethod<T>(receiver: unknown, method: T): T {
  if (typeof method !== "function") return method;
  if (receiver === null || (typeof receiver !== "object" && typeof receiver !== "function")) {
    return method.bind(receiver) as T;
  }
  let methods = cache.get(receiver);
  if (methods === undefined) {
    methods = new WeakMap();
    cache.set(receiver, methods);
  }
  let bound = methods.get(method);
  if (bound === undefined) {
    bound = method.bind(receiver) as Function;
    methods.set(method, bound);
  }
  return bound as T;
}

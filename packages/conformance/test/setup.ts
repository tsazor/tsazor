/**
 * Captures exceptions that escape the renderer's microtask flush.
 *
 * Today the renderer has no per-component error isolation (review R9): a throw
 * in buildRenderTree/DOM patching escapes `queueMicrotask` as a global uncaught
 * exception, which Vitest reports as an unhandled error of the whole run. This
 * wrapper collects those errors instead, and the harnesses re-throw them inside
 * the test that caused them — so a render failure fails exactly that test.
 *
 * Once the render queue isolates errors itself (roadmap B2), nothing escapes
 * and this wrapper becomes a no-op; it can then be deleted.
 */
import { beforeEach } from "vitest";

const escaped: unknown[] = [];

const original = globalThis.queueMicrotask.bind(globalThis);
globalThis.queueMicrotask = (callback: VoidFunction): void => {
  original(() => {
    try {
      callback();
    } catch (error) {
      escaped.push(error);
    }
  });
};

/** Returns and clears the errors that escaped render flushes since the last call. */
export function takeEscapedRenderErrors(): unknown[] {
  return escaped.splice(0, escaped.length);
}

// Each test starts clean: errors from an earlier test must not leak into the next.
beforeEach(() => {
  escaped.length = 0;
});

/**
 * Trusted Types (`require-trusted-types-for 'script'`): `new Worker(url)` is a
 * sink that only takes a TrustedScriptURL. Vite only bundles a worker
 * written exactly as `new Worker(new URL("./x.worker.ts", import.meta.url))`,
 * so the URL can't be wrapped in the app's code. Instead, the first worker
 * start installs the policy named `default`, which the browser consults for
 * plain values at a sink. It passes **same-origin script URLs only** (the
 * app's own chunks) and refuses everything else — no HTML, no scripts, no
 * other origins. The app's CSP must allow the name:
 * `trusted-types tsazor default`.
 */

interface TrustedTypesFactory {
  readonly defaultPolicy: unknown;
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): unknown;
}

let installed = false;

/** Installs the same-origin `default` policy once, where Trusted Types exist and no default policy does. */
export function ensureWorkerPolicy(): void {
  if (installed) return;
  installed = true;
  const factory = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
  if (!factory || factory.defaultPolicy) return;
  try {
    factory.createPolicy("default", {
      createScriptURL(input: string): string {
        const location = (globalThis as { location?: { href: string; origin: string } }).location;
        const url = new URL(input, location?.href);
        if (location && url.origin !== location.origin) {
          throw new TypeError(`@tsazor/worker: only same-origin worker scripts are allowed under Trusted Types, not ${url.origin}.`);
        }
        return url.href;
      },
    });
  } catch {
    // The CSP doesn't allow the name 'default': starting the worker fails, and
    // the client explains it (see workerStartError).
  }
}

/** A clearer error for a worker start the Trusted Types policy blocked. */
export function workerStartError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (!/TrustedScriptURL/i.test(message)) return error;
  return new Error(
    `Starting the worker was blocked by Trusted Types (${message}). Allow the policy 'default' in your Content-Security-Policy — 'trusted-types tsazor default' — @tsazor/worker uses it to let same-origin worker scripts through.`,
  );
}

/**
 * The document head as an opt-in: `createTsazorApp` renders `HeadOutlet` into
 * `<head>` only once `PageTitle` or `HeadContent` is part of the app — their
 * modules provide the outlet when they load (also a lazy page's, later). An
 * app without them does not bundle the head and sections machinery.
 */

let outlet: unknown;
const waiting = new Set<(outlet: unknown) => void>();

/** @internal Called at module level by `PageTitle` and `HeadContent`. */
export function provideHeadOutlet(type: unknown): void {
  if (outlet !== undefined) return;
  outlet = type;
  for (const mount of [...waiting]) mount(type);
  waiting.clear();
}

/** @internal `mount` runs with the outlet type now or once it is provided; the result stops waiting. */
export function whenHeadOutlet(mount: (outlet: unknown) => void): () => void {
  if (outlet !== undefined) {
    mount(outlet);
    return () => {};
  }
  waiting.add(mount);
  return () => waiting.delete(mount);
}

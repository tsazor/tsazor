import { createFilter } from "vite";

/** The `lazyRoutes` option as a predicate over a page's absolute path. */
export function lazyRouteFilter(lazyRoutes: boolean | string[] | undefined, root: string): (componentPath: string) => boolean {
  if (lazyRoutes === true) return () => true;
  if (!lazyRoutes || lazyRoutes.length === 0) return () => false;
  const filter = createFilter(lazyRoutes, null, { resolve: root });
  return (componentPath) => filter(componentPath);
}

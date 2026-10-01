/**
 * HMR appendix appended to every compiled .tsazor module: the module accepts
 * its own updates and asks the runtime to swap the component class in place.
 * `hot.data.previousDefault` threads the previously live class through
 * module instances so `hmrSwap(oldType, newType)` keeps running instances.
 */
export function hmrAppendix(className: string): string {
  return [
    "",
    `if (import.meta.hot) {`,
    `  if (import.meta.hot.data) import.meta.hot.data.previousDefault ??= ${className};`,
    `  import.meta.hot.accept((mod) => {`,
    `    const previous = import.meta.hot.data?.previousDefault;`,
    `    if (import.meta.hot.data) import.meta.hot.data.previousDefault = mod.default;`,
    `    globalThis.__tsazor?.hmrSwap(previous, mod.default);`,
    `  });`,
    `}`,
    "",
  ].join("\n");
}
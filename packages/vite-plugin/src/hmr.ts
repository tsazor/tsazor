/**
 * HMR appendix appended to every compiled .tazor module: the module accepts
 * its own updates and asks the runtime to swap the component class in place.
 * `hot.data.previousDefault` threads the previously live class through
 * module instances so `hmrSwap(oldType, newType)` keeps running instances.
 */
export function hmrAppendix(className: string): string {
  return [
    "",
    `if (import.meta.hot) {`,
    `  import.meta.hot.data.previousDefault ??= ${className};`,
    `  import.meta.hot.accept((mod) => {`,
    `    const previous = import.meta.hot.data.previousDefault;`,
    `    import.meta.hot.data.previousDefault = mod.default;`,
    `    globalThis.__tasor?.hmrSwap(previous, mod.default);`,
    `  });`,
    `}`,
    "",
  ].join("\n");
}
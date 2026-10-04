/**
 * S3 — never block development. With `check: true`, the dev server runs the
 * same check as the build (`tsazor check`: compiler diagnostics and the typed
 * shadow checks) in the background: once at start, then after every change
 * to a `.tsazor` or `.ts` file (debounced). The findings go to the console.
 * Nothing waits for it: modules keep compiling and HMR keeps updating, so a
 * type error never fails a module. Production builds still fail on errors
 * (the plugin's `closeBundle`).
 */
import type { CheckDiagnostic } from "@tsazor/lsp";

export interface DevCheckOptions {
  /** Project root the check runs over. */
  root: string;
  /** Receives every output line (diagnostics and the summary). */
  log: (line: string) => void;
  /** Debounce after a change, in ms (default 300). */
  delay?: number;
  /** The check itself (default: the build's `runBuildCheck`). */
  run?: (root: string, log: (line: string) => void) => Promise<CheckDiagnostic[]>;
}

/** The part of Vite's file watcher the dev check listens to. */
export interface DevCheckWatcher {
  on(event: "change" | "add" | "unlink", listener: (file: string) => void): unknown;
}

export interface DevCheck {
  /** Resolves when no check is running or scheduled (tests). */
  idle(): Promise<void>;
  /** Stops reacting to changes. */
  stop(): void;
}

const CHECKED = /\.(tsazor|ts)$/;

export function startDevCheck(watcher: DevCheckWatcher, options: DevCheckOptions): DevCheck {
  const delay = options.delay ?? 300;
  let running: Promise<void> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const run = async (): Promise<void> => {
    const check = options.run ?? (await import("./check-hook.js")).runBuildCheck;
    try {
      await check(options.root, options.log);
    } catch (error) {
      options.log(`check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  // One run at a time; changes during a run schedule exactly one more.
  const trigger = (): void => {
    if (running) {
      again = true;
      return;
    }
    running = run().finally(() => {
      running = null;
      if (again && !stopped) {
        again = false;
        trigger();
      }
    });
  };
  const onChange = (file: string): void => {
    if (stopped || !CHECKED.test(file) || file.includes("node_modules")) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      trigger();
    }, delay);
  };
  for (const event of ["change", "add", "unlink"] as const) watcher.on(event, onChange);
  trigger();

  return {
    async idle() {
      while (running || timer) {
        await (running ?? new Promise((resolve) => setTimeout(resolve, delay)));
      }
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

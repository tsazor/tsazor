/**
 * Root Vitest config: single `pnpm test` entrypoint over all packages.
 *
 * Replaces the deprecated `defineWorkspace` form of vitest.workspace.ts — the
 * old workspace list missed packages/fluent and packages/bootstrap, so the
 * root run silently skipped the component packages. Each project resolves its
 * own vitest.config.ts (happy-dom for runtime/testing/fluent/components, node
 * for compiler/lsp/vite-plugin); workspace, lsp and cli run on Vitest defaults.
 *
 * apps/* (gallery, demo, …) are excluded: they verify via their own
 * scripts/verify.mjs browser E2E, not Vitest.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/runtime",
      "packages/compiler",
      "packages/workspace",
      "packages/lsp",
      "packages/cli",
      "packages/testing",
      "packages/vite-plugin",
      "packages/fluent",
      "packages/bootstrap",
      "packages/conformance",
      "packages/dotnet",
    ],
  },
});
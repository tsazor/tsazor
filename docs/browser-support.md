# Browser support

Tsazor supports the **current versions of the evergreen browsers** — the same promise Blazor
makes:

| Browser | Supported | Checked in CI |
|---|---|---|
| Microsoft Edge, Google Chrome (Chromium) | current version | yes — the installed Edge |
| Mozilla Firefox | current version | yes — Playwright's Firefox build |
| Apple Safari, macOS and iOS | current version | WebKit — Playwright's WebKit build on Windows/Linux, close to Safari but not Safari itself |

Older browsers are not supported. Internet Explorer never was.

## What that rests on

- **Build target ES2022.** The Vite plugin compiles `.tsazor` and `.ts` to ES2022 (class fields,
  private methods, top-level `await`, static blocks); decorators are lowered by esbuild, so no
  browser needs native decorator support. ES2022 is what browsers from 2022/2023 on run.
- **Web standards only.** The runtime uses standard DOM APIs; nothing browser-specific, no
  user-agent checks. Features with their own requirements:
  - transitions and animations (`@transition`, `@animate`): the Web Animations API;
  - `@tsazor/worker`: module workers (`new Worker(url, { type: "module" })`);
  - `Virtualize`, `anchoredPosition`: `ResizeObserver`;
  - reduced motion: `matchMedia("(prefers-reduced-motion: reduce)")`.
  All of them are available in the supported browsers.

## How it is checked

The browser gates of the repository — the tutorial (every lesson's preview), the demo (a strict
Content-Security-Policy, accessibility with keyboard patterns, the Web Worker), the gallery, the
Blazing Pizza port — run in all three engines:

```bash
TSAZOR_BROWSER=edge    node apps/demo/scripts/verify-a11y.mjs   # default
TSAZOR_BROWSER=firefox node apps/demo/scripts/verify-a11y.mjs
TSAZOR_BROWSER=webkit  node apps/demo/scripts/verify-a11y.mjs
```

Firefox and WebKit come from Playwright (`npx playwright-core install firefox webkit`); Playwright
can't drive the regular Firefox or Safari.

## Differences the gates found, and how Tsazor handles them

- **Safari doesn't focus a button on click.** A dialog opened with the mouse would not know where
  to return focus when it closes. `focusTrap` (`@tsazor/ui`) also remembers the last pressed
  focusable element, so focus returns to the opener in every browser.
- **A sandboxed, opaque-origin frame can't start module workers** (Chromium). Only the tutorial's
  preview runs in such a frame; it runs lesson workers as classic workers. Apps are not affected.

What remains yours, as with any framework: your own CSS (check it in the browsers you support)
and browser APIs you call directly.

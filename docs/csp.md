# Content Security Policy

A Tsazor app's production build runs under a strict Content Security Policy: no
`'unsafe-inline'`, no `'unsafe-eval'`, and Trusted Types enforced. The runtime has no `eval` or
`new Function`, attaches event handlers with `addEventListener` (no inline `onclick`), and uses
`innerHTML` only for `MarkupString`. CI checks this with the demo app
(`apps/demo/scripts/verify-csp.mjs`, a real browser, any violation fails).

## The policy

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
require-trusted-types-for 'script';
trusted-types tsazor
```

Send it as a response header from the server that serves the built files. Add your API's
origin to `connect-src` if it isn't the same origin. `img-src data:` is there for CSS libraries
that embed small icons (Bootstrap does).

## Two settings in the app

**`strictCsp: true` for style attributes.** A `style-src` without `'unsafe-inline'` blocks
`setAttribute("style", …)`, which is how `style="…"` in markup is written by default (the text
stays exactly as written, as in Blazor). With the option, the runtime writes style attributes
through the CSSOM (`element.style.cssText`), which the policy allows:

```ts
createTsazorApp({ root: App, routes, strictCsp: true });
```

The browser then normalizes the attribute's text (`color:red` reads back as `color: red;`).
Leave the option off in unit tests that compare markup.

**Trusted Types: the `tsazor` policy.** Under `require-trusted-types-for 'script'`, `innerHTML`
only accepts `TrustedHTML`. `MarkupString` goes through a policy named `tsazor` that the runtime
creates on first use, so the CSP must allow that name (`trusted-types tsazor`; add
`'allow-duplicates'` if two copies of the runtime share a page). The policy passes the string
through unchanged: `MarkupString` is your statement that the HTML is safe, as in Blazor. HTML
from users or other systems has to be sanitized before it becomes a `MarkupString` (for
example with DOMPurify).

## What needs `'unsafe-inline'`

- `<style>` elements in a component's markup. Put the rules in the component's `X.tsazor.css`
  (scoped) or in the app's stylesheet instead.
- Inline `<script>` in `index.html`. Vite's build doesn't produce any.

The Vite dev server is not meant to run under this policy (its client injects styles for HMR).
Test the policy against the production build.

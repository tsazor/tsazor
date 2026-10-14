# Security policy

## Supported versions

Security fixes go to the latest minor of the current major and, for 12 months after a new major ships, to the last
minor of the previous one. Prereleases (`-next`, `-rc`) get none: move to the latest. The details are in the
[support policy](docs/support-policy.md).

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately on GitHub: the repository's **Security** tab →
**Report a vulnerability** ([private vulnerability reporting](https://github.com/tsazor/tsazor/security/advisories/new)).

Please include:

- the package(s) and version(s), and the browser if it matters;
- what an attacker can do, and under which conditions;
- a minimal reproduction: a `.tsazor` component or an app and the input that triggers it; where the compiler is
  involved, the generated code too (Vite's build output).

## What happens next

- We confirm the report within **5 working days**, and tell you within **14 days** whether we accept it and how
  severe we rate it (CVSS).
- We fix it privately and release the fix as a patch of every package (one version for all of them). The goal is
  **90 days** from the report at most, much sooner for a critical issue.
- Then we publish a GitHub security advisory, with a CVE where it applies; npm and Dependabot pick it up from
  there. We credit you in it, unless you'd rather not be named.
- Please keep the issue confidential until the advisory is out. If we can't meet a date, we tell you and agree on a
  new one.

## Scope

In scope are the published packages (`@tsazor/*`, `create-tsazor`), the VS Code extension, and the code the
compiler generates. For example:

- data bound with `@` that ends up as markup or script instead of text or an attribute value;
- a gap in what the runtime keeps under a strict Content Security Policy and Trusted Types ([csp.md](docs/csp.md));
- unsafe defaults written by `create-tsazor` or the `@tsazor/dotnet` BFF template;
- a published tarball that doesn't match the repository's source.

Not vulnerabilities in Tsazor, by design:

- **`MarkupString`** renders its HTML as it is. It is the app's statement that the HTML is safe, as in Blazor; HTML
  from users or other systems must be sanitized first (for example with DOMPurify, or `@tsazor/markdown`, which
  does).
- **`AuthorizeView` and `@authorize`** decide what the app shows, not what a user may do: the server enforces access
  ([auth.md](docs/auth.md)).
- The apps in this repository (the tutorial, the samples, the ports) are examples, unless the flaw is in a package
  they use.
- A vulnerability in a dependency (TypeScript, esbuild, PostCSS, marked, DOMPurify) or in Vite's dev server belongs
  to that project; tell us too, and we update.

## Supply chain

- The packages are published only from this repository's release workflow, with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements): `npm audit signatures` checks it.
- Every release has a [CycloneDX](https://cyclonedx.org/) SBOM of its packages and their dependencies, attested for
  the tarballs: `gh attestation verify <tarball> --repo tsazor/tsazor --predicate-type https://cyclonedx.org/bom`.
- The browser packages depend on nothing outside Tsazor, apart from `@tsazor/markdown` (marked, DOMPurify) and the
  peers an app chooses (Bootstrap for `@tsazor/bootstrap`).

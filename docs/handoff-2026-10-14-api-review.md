# Handoff: E3, the E10 draft and the API review (2026-10-14)

**Read first:** this document, then [api-review-1.0.md](api-review-1.0.md) and [support-policy.md](support-policy.md).
The earlier state is in [handoff-2026-10-13-decisions.md](handoff-2026-10-13-decisions.md). Branch `roadmap/phase-0`.

## Done today

| Item | Commit |
|---|---|
| The Edge parity "flake": deterministic — the test read "before" while Virtualize still used the ItemSize estimate; it waits for the last row now (Edge 514/514, group G in Firefox and WebKit 124/124) | `f6fe15b` |
| E3: an SBOM per release (`pnpm release:sbom`, every publish, checked by the rehearsal, attested in `release.yml`), `SECURITY.md`, the upstream icons' MIT license in four packages' `LICENSE` | `0c3686a` |
| E10: [support-policy.md](support-policy.md) as a draft, D-S1…D-S7 | `0c3686a` (+ D-S7 with the review) |
| CI's check job was red since BlazorHero's phase 0 (`vitest run` without tests exits 1) | `b95c86c` |
| The rehearsal under `pnpm rehearsal` (CI) installed the starter with pnpm: pnpm's `npm_config_user_agent` reached `npm create` | `96e1bbd` |
| The API review: five reviews, consolidated | this commit |

`ci:local` green for `96e1bbd` (the SBOM under npm 10 too). Nothing was pushed yet today when this was written.

## The API review's Parts 1 and 2 in progress (owner: "so schlank wie möglich")

| Step | Commit |
|---|---|
| E10 decided, Node 22.12, SECURITY.md without deadlines | `f8b63fe` |
| THIRD-PARTY-NOTICES (owner: "ist ja auch gerecht so") | `1a64f8f` |
| R1 ComponentBase plumbing private (`componentInternals`), R2/R8 `@tsazor/runtime/internal`, R3 real enums; testing without `renderer`; Part 1 tiers in api-snapshot (`api/*.internal.api.d.ts`; compiler, workspace, lsp internal) | `665d343` |
| R4 aliases removed, R5 `stripInternal` (tags reviewed one by one), `TsazorApp` without `renderer` | `8901d94` |
| R6 `#private` in extendable bases, R7 exports + the forgotten-export gate, T1 vite-plugin root, T5 `staticMarkup`/`renderHints` gone, X1 dotnet | `21c5c70` |
| X2 `JwtClaims` JSON values, X3 charts math, X4 worker | `959b6c8` (pushed) |
| Part 3 (owner: "alle nach Empfehlung"): D1 InputBase/ValidationMessage camelCase, D2 field paths, D3 TS event vocabulary, D11/T3 TZS033–TZS035 | `21ee1be` |
| D4 dates in the CultureService culture (`LibraryTexts.locale`), D5 one default intent, D12 async policies (`addPolicy`), D14 HttpResult doc, D15 Toaster note | `e39c0f1` |
| D13 generated client: `options?: RequestOptions`, header warning, `--path-value` (B4), naming contract; fix: the client ignored its TsazorHttp's baseUrl/defaultHeaders | `895a110` |
| D10 manifest across versions: rules, TZS036, 1.0 fixture | `b150b0b` |
| D7 typed `FluentTokenOverrides` | `79c881c` |
| D6 one `Table` in both skins (`TItem`, items or childContent) | `a693660` |
| D9 `tsazor build-lib` / `buildLibrary` (the four libraries build through it; lockfile: importer lines only) | `0e34430` |
| D8/U1 `@tsazor/ui/kit` (~150 helpers; public snapshot 1367 → 782 lines; copy-in pins `@tsazor/ui` exactly) | `78bb24b` |
| U2 no built-in icon names/English label constants, private DialogReference ctor; U3 Async rule; U4 ToastEntry, KeyCombination, dismissible, kebab error codes; U5 behavior factories, opaque Layer | `dbca18d` `9ac659b` `cff1063` `e1ff738` |
| The library build type-checks its sources (found 8 errors per skin); S3 typed validators, NumberInput min/max/step | `2d8986d` |
| S1 Bootstrap Toast, S2 cascading members out of declarations, S4 OptionsSearchEventArgs in ui + `reexportTypes`, S5 Wizard labels, Skeleton circular | `11190c6` `b01293b` `ef78ae1` |
| T2 exit codes, T4 routes type, T6 plugin line format, X5 star-export shadowing gate; an ItemsProvider test raced in WSL | `040feb1` `024f65b` `a1669d0` `2405bc4` `b0b0b48` |
| Part 5: lsp server runs from npm (`tsazor-lsp`) and answers initialize at once (the scan blocked minutes), dotnet integer[] queries, charts texts/numbers, scrollLock scrollbar | `4c2e2cb` `37949fa` |
| Part 4 gates: skin parity (`api/skin-parity.json`; Bootstrap got Button ariaDescribedBy/shape, Card ariaLabel, …), bin smoke, ABI pin (`api/abi.json`), snapshot shows ambient modules + deprecation tags | `fb5f9eb` `fb18d8c` `dbc591e` `c39f70e` |

The runtime's public snapshot: 1988 → ~1690 lines (exports added for R7). Open in Part 2: ui (U1 `/kit`, U2–U5),
the skins (S1–S5), the tools (T2 CLI validation/exit codes, T3 diagnostic prefix, T4 routes type, T6 output
format), X5 (testing/runtime name collision check), the remaining gates (skin manifest diff, ABI pin test, bin smoke),
Part 5's bugs. Working tricks: scripts with CRLF-tolerant anchors in the scratchpad; a strict consumer
(`skipLibCheck: false`) over the dist declarations after a `stripInternal` change; `gen-runtime-manifest.mjs` after a
runtime component changes. Two conformance tests failed once each under full-suite load (bind-format,
class-fields), green alone. `vite.config.ts` of blazorhero/fluentcms fails plain `tsc` (two vite copies with
different `@types/node` in the store; not from these changes).

## Waiting for the owner

1. ~~E10~~ — decided (owner: "E10 okay", `f8b63fe`): Node 22.12 is the floor; a sentence says the time spans are
   plans of a small project, not service levels.
2. **The API review:** Parts 1 and 2 approved (owner: "die öffentliche API so schlank wie möglich") — in progress.
   The whole review is done: Parts 1–5 (policy, slimming, D1–D15, the gates, the bugs). Pushed through the commit
   that adds this line.
3. ~~SECURITY.md's commitments~~ — no deadlines (owner: "kein professionelles Projekt, mit Zusagen vorsichtig").
4. ~~Attribution of ported code~~ — decided (owner: "ist ja auch gerecht so"): `THIRD-PARTY-NOTICES.md` and the
   notices in the LICENSE of runtime, ui and fluent. The curated first commit of `tsazor/tsazor` must carry the file.
5. Still open from before: the Docker containers of fullstackhero's Aspire backend are "persistent" (keep or
   remove?); `apps/fluentcms-admin` and its lockfile change stay untouched. 2026-10-15: `apps/fluentcms-admin` is
   not the owner's WIP — a Claude session started it on 2026-09-30 and the committed `apps/fluentcms` replaced it.
   Proposed: delete it and reset `pnpm-lock.yaml` to HEAD; remove the six `*-5c6891ec` containers, their images and
   the `fsh-starter-postgres-data` volume. Both wait for the owner's go.

## After the review (2026-10-15)

- **Bundle size against React** (owner: "wichtige Infos für Teams"): `docs/bundle-size.md`. The fixed part (runtime
  and built-ins) is 37 KB gzip against React's 142 KB with its libraries; the code per component is about 1.5× JSX.
- **esbuild's decorator helpers are in an app once** (owner: "setze das um"): `virtual:tsazor-decorators` in the
  plugin, `dist/_decorators.js` in a library (redirected to the app's), shared only when the text is the same.
  −6 to −11% of all JS gzip in the four apps measured.
- **Compact field decorators** (owner: "noch einen Schritt in Richtung kompakten Code"): the runtime's registering
  field decorators are applied after the class by `decorateFields` (new runtime export, in `api/abi.json`) instead of
  being lowered — components (plugin, build-lib) and the app's own `.ts` files (the plugin's pre-transform, before
  Vite's esbuild; that also removed the helper copies of plain `.ts` modules without needing `Plugin[]`). Only
  classes whose every decorator qualifies; positions kept (blanks, the call after the closing brace, the import at
  the end). Another −5 to −7%: fullstackhero 269 KB gzip against React's 322.
- **Found on the way:** `build-lib` wrote the build machine's paths into `dist` (`@code (file:line)` comments; now
  package-relative); the tutorial's preview lacked `@tsazor/runtime/internal` in its import map since the API review
  (`@tsazor/testing` imports it; ch18 failed — only the e2e job runs `tutorial verify`, not `ci:local`).
- **Proposed, not decided:** re-measure the bench: the README says 26.2 KB gzip (2026-10-06), a build today is
  29.9 KB (Vue 26.3).

## Working knowledge from today

- **A flake with identical numbers in every failing run is deterministic.** A probe that runs the scenario 20× and
  prints the state at the "before" read found it in minutes (scratchpad `probe-append.mjs` pattern).
- **`npm sbom` can't read a pnpm workspace**; the release installs the tarballs with npm into an empty project.
  `--omit peer` drops `@tsazor/runtime` (a peer of the libraries); `--legacy-peer-deps` doesn't. npm 11 redacts its
  own serial number (`urn:uuid:***`).
- **Scripts started by pnpm hand `npm_config_*` to every npm they start**, and npm takes them as its configuration
  (`npm_config_user_agent` decides which manager `create-tsazor` installs with). The rehearsal strips `npm_*`.
- **The reviews ran as five parallel agents** with one prompt each (scope, criteria ranked by cost after 1.0,
  "verify every finding, grep usages, ≤ 25 findings"); their summaries are condensed into the review document.

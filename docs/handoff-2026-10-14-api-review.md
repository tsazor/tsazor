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

## Waiting for the owner

1. **E10, D-S1…D-S7** ([support-policy.md](support-policy.md)): LTS window 12 months, deprecation rules, Node 22 as
   the floor before 1.0 (Node 20 is end-of-life), what the promise covers.
2. **The API review** ([api-review-1.0.md](api-review-1.0.md)): Part 2 is recommended in full (hide, remove, rename;
   no trade-offs); Part 3 has fifteen decisions (D1…D15), each with a recommendation. Once decided, the work order is
   in its last section.
3. **SECURITY.md's commitments:** 5 working days to confirm, 14 to assess, 90 to fix — the owner's to accept.
4. **Attribution of ported code:** the runtime ports Blazor's semantics and parts of its logic (Virtualize from
   Blazor's `Virtualize.ts`), the Fluent skin Fluent UI Blazor's components; both are MIT. Whether that needs the
   .NET Foundation's / Microsoft's notice in `LICENSE` (as the icons now have) is a licensing question, not decided.
5. Still open from before: the Docker containers of fullstackhero's Aspire backend are "persistent" (keep or
   remove?); `apps/fluentcms-admin` and its lockfile change stay the owner's WIP, untouched.

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

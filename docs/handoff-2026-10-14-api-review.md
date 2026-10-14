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

1. ~~E10~~ — decided (owner: "E10 okay", `f8b63fe`): Node 22.12 is the floor; a sentence says the time spans are
   plans of a small project, not service levels.
2. **The API review:** Parts 1 and 2 approved (owner: "die öffentliche API so schlank wie möglich") — in progress.
   Part 3 (D1…D15) still needs the owner's answers.
3. ~~SECURITY.md's commitments~~ — no deadlines (owner: "kein professionelles Projekt, mit Zusagen vorsichtig").
4. ~~Attribution of ported code~~ — decided (owner: "ist ja auch gerecht so"): `THIRD-PARTY-NOTICES.md` and the
   notices in the LICENSE of runtime, ui and fluent. The curated first commit of `tsazor/tsazor` must carry the file.
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

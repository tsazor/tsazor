# Support policy

Status: **decided (owner, 2026-10-14).** Roadmap item E10 ([roadmap-1.0.md](roadmap-1.0.md)), decisions D-S1 …
D-S7; the alternatives that were weighed stay noted.

The [stability promise](design-principles.md#type-safety-is-a-requirement--the-stability-promise) says what stays
the same within a major: **code that passes `tsazor check` (strict) behaves the same on every 1.x release.** This
page adds the rest a team needs to plan with: which versions get fixes and for how long, how an API goes away,
and which platforms a version runs on.

Tsazor is a small project. The rules on this page are the ones it follows; the time spans in them are what it plans
for, not guaranteed service levels.

## Versions and their support

| Version | Status | Gets |
|---|---|---|
| 1.x, the latest minor | current | every fix: bugs, security, regressions |
| 1.x, an older minor | — | nothing: the next minor is a free upgrade (the promise) |
| the previous major, for 12 months after the next major ships | maintenance | security fixes and critical regressions |
| `1.0.0-next.N`, `1.0.0-rc.N` | prerelease | nothing: the next prerelease replaces it |

## Decisions

- **D-S1 — Semantic versioning, one version for every package.** A major for breaking changes, a minor for
  additions, a patch for fixes; every published package carries the same version (D-P1,
  [design-release.md](design-release.md)). "Breaking" is what the stability promise excludes: anything that turns a
  passing `tsazor check` into an error, or changes what checked code does. Prereleases promise nothing.

- **D-S2 — No fixed release train; at most one major a year.** Patches when a fix is ready, minors when a feature
  is. A major is announced at least three months ahead, with its breaking changes listed and their codemods ready.
  *Alternative:* majors tied to .NET's November releases. Not recommended: Blazor's new features reach Tsazor as
  additions (minors), so .NET's cadence gives Tsazor no reason for a major.

- **D-S3 — Fixes: the current minor; the previous major for 12 months.** Fixes go into the latest minor only,
  because moving to it is free by the promise. When a new major ships, the last minor of the previous one gets
  security fixes and fixes for critical regressions (data loss, a crash or a broken render in a supported browser)
  for **12 months**. *Alternatives:* 6 months (less work, short for teams with a release cycle of their own);
  18–36 months (.NET's STS/LTS; more than a small team can honor). 12 months is one migration window per year,
  matching D-S2.

- **D-S4 — Deprecation before removal.** An API, a component parameter or a behavior goes away in this order:
  1. It is marked deprecated in a minor: `@deprecated` in its JSDoc with the replacement, a `tsazor check`
     warning and the language server's strikethrough, a "Deprecated" entry in the CHANGELOG, and a quick fix or
     codemod wherever the change is mechanical.
  2. It keeps working for the rest of the major, and for at least 6 months.
  3. It is removed in the next major, never in a minor.

  A behavior change follows the same path: first an opt-in setting, then the new default in a major, with the old
  behavior as an opt-out for that major.

- **D-S5 — Platforms.**
  - **Browsers:** the current evergreen browsers ([browser-support.md](browser-support.md)). They move
    continuously; a browser's old version leaving support is not a breaking change.
  - **Node.js (the tools: cli, compiler, lsp, vite-plugin, dotnet, create-tsazor):** the Node.js lines in active or
    maintenance LTS. A line that reached its end of life is dropped in the next major. 1.0 starts at
    `>=22.12` (Vite 7's floor in the Node 22 line); Node 20 reached its end of life on 2026-04-30 and was dropped
    before 1.0.
  - **TypeScript:** the tools bring their own `typescript` (a dependency, not the app's choice). Tsazor moves it
    within its range in minors; a TypeScript version that changes what `tsazor check` accepts for valid code waits
    for a major.
  - **Vite:** the peer range (`^5 || ^6 || ^7` today). A new Vite major is added in a minor; an old one is dropped
    only in a major.
  - **.NET (the `@tsazor/dotnet` BFF template and its backend):** the .NET versions Microsoft supports.

- **D-S6 — End of life is announced, not discovered.** When a major ships, this page states the end date of the
  previous one's maintenance; the date is also in the release notes. After it, the version gets nothing more.

- **D-S7 — What the promise covers** (from the [API review](api-review-1.0.md), Part 1). Three tiers: **public**
  (the app-facing APIs, the CLI's commands, flags and exit codes, the TZS codes), **ABI** (what compiled `.tsazor`
  code calls, listed in [api/abi.json](../api/abi.json) and pinned by a test, and the component manifest: additive
  only, so a library built with 1.x runs on every later 1.y), and
  **internal** (the programmatic APIs of compiler, workspace and lsp, `@tsazor/runtime/internal`, `@tsazor/ui/kit`:
  released in lockstep, may change in any minor). Diagnostic texts, TypeScript's own codes and generated names are not
  covered. Growth rules: literal unions may gain members in a minor; contracts that libraries implement gain only
  optional members; ComponentBase gains public members only in a major.

## Security

Vulnerabilities are reported privately and fixed in every version that is supported here; the process is in
[SECURITY.md](../SECURITY.md).

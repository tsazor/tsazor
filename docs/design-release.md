# Design: publishing (R2) and the release rehearsal

Status: decided 2026-10-12 (owner: D-P1, D-P2). Roadmap item R2 ([roadmap-1.0.md](roadmap-1.0.md)), with the
provenance part of E3.

## Decisions

- **D-P1 — Lockstep versions (owner).** Every published package — the `@tsazor/*` packages and `create-tsazor` —
  carries the same version. They are built, tested and released together, and the starter pins all of them, so a
  user never has to match a version matrix (as with Angular or Vue's core packages). Until 1.0: prereleases
  `1.0.0-next.N` under the dist-tag `next`, then `1.0.0-rc.N`, then `1.0.0`. The VS Code extension
  (`packages/vscode`, the marketplace) keeps its own version; `@tsazor/conformance` stays private.
- **D-P2 — Prereleases go to a local registry only (owner).** While the repository is private, nothing goes to npm:
  prereleases land in a [Verdaccio](https://verdaccio.org/) registry on the developer's machine, and the owner's apps
  install from there as users will from npm. npm sees the first version on release day, from the public repository
  `tsazor/tsazor` (the GitHub org and the empty private repository exist since 2026-10-08).
- **D-P3 — A script of our own, no changesets.** Lockstep with one hand-written `CHANGELOG.md` leaves changesets
  nothing to decide; `scripts/release.mjs` sets the version, packs, checks and publishes.
- **D-P4 — Packing and publishing are two steps.** `pnpm pack` writes each package's tarball (it replaces
  `workspace:*` with the version); `npm publish <tarball>` sends it. The same tarballs go to Verdaccio and, on release
  day, to npm: npm's CLI is the one that does Trusted Publishing (OIDC, npm 11.5.1 or later) and provenance.
- **D-P5 — Every tarball is checked before it leaves.** `release.mjs pack` fails when a tarball lacks its
  `README.md`, `LICENSE` or a file its `exports`/`main`/`types`/`bin` point at; when it carries tests,
  `tsconfig.tsbuildinfo` or `node_modules`; when a `workspace:` range is left; or when the versions differ.
- **D-P6 — Internal dependencies are exact.** `workspace:*` becomes the exact version, peers included: a release
  is one set, and `pnpm update` moves all of it.
- **D-P7 — Metadata.** Every published package has `repository` (`tsazor/tsazor`, its directory), `homepage`,
  `bugs`, `license`, its own `LICENSE` copy (npm doesn't take the root's) and a `README.md`; the scoped ones
  `publishConfig.access: public`. The tools that run in Node (cli, compiler, workspace, lsp, vite-plugin, dotnet,
  create-tsazor) declare `engines.node >=22.12` (Vite 7's floor in the Node 22 line; Node 20 reached its end of life
  on 2026-04-30, support-policy.md D-S5).

## The commands

| Command | What it does |
|---|---|
| `pnpm release:version 1.0.0-next.2` | Sets the version in every published package and opens a CHANGELOG section for it. Commit it. |
| `pnpm release:pack` | Packs every published package into `.release/` and checks the tarballs (D-P5). Needs `pnpm -r build`. |
| `pnpm release:sbom` | Packs, then writes the release's SBOM to `.release/tsazor-<version>.cdx.json` (see "The SBOM"). Every publish writes it too, before anything goes out. |
| `pnpm registry` | Starts the local Verdaccio (`http://localhost:4873`, storage in `~/.tsazor/registry`; `@tsazor/*` and `create-tsazor` only from there, everything else proxied from npm). |
| `pnpm release:local` | Packs and publishes the current version to the local registry, dist-tag `next` for a prerelease. A version is published once: bump first. |
| `pnpm rehearsal` | The rehearsal gate (CI's check job, so `ci:local` too): a fresh Verdaccio in a temp directory, every package published to it, then `npm create tsazor` with Fluent and `--dotnet` from that registry, `npm install`, `tsazor check`, `vite build`, the app's test, the dist-tags. |

`npm create tsazor@next my-app --registry http://localhost:4873/` starts an app from the local registry (npm hands
`--registry` down to the starter's install). For every later install, the app needs an `.npmrc`:

```ini
@tsazor:registry=http://localhost:4873/
```

A package's first publish to a registry sets `latest` as well, whatever the tag; from then on a prerelease moves
`next` only.

**Found on the way (2026-10-12):** eleven packages would have shipped `dist/.tsbuildinfo` (now `!dist/.tsbuildinfo`
in their `files`), `tsazor --version` said 0.2.0 and `tsazor-dotnet --version` 0.1.0 (constants; now read from the
package), eleven packages had no README, none had a LICENSE, and `@tsazor/lsp` had no `files` list.

## The SBOM (E3)

One [CycloneDX](https://cyclonedx.org/) document per release describes what a user installs: every published
package with its tarball's SHA-512 (npm's `integrity`), and the dependencies npm resolves for them. pnpm has no SBOM
command, and `npm sbom` can't read a pnpm workspace, so `release.mjs` installs the packed tarballs with npm into an
empty project, as an app would, and runs `npm sbom` there. Then it makes the document the release's:

- the root is the release (`tsazor`, type `framework`), not the private project npm sees;
- the packages' `distribution` links point at npm's tarballs, not at the build machine's files;
- peers stay out: Vite and Bootstrap are the app's choice (`--legacy-peer-deps`, which also keeps
  `@tsazor/runtime`, a peer of the libraries, from being dropped as one); the `@tsazor` peers are added back as
  dependencies;
- code generated or copied from another project is the package's `pedigree`: the icon packages and both skins
  come from `@fluentui/svg-icons` and `bootstrap-icons`, at the versions their workspace packages pin;
- the serial number is set anew: npm 11 redacts its own UUID as if it were a secret (`urn:uuid:***`).

It fails when a tarball is missing from the document or its hash differs. The third-party versions are those the
ranges resolve to on the day of the release, and esbuild's optional platform package is the build machine's
(Linux on release day). The rehearsal checks that the SBOM lists every package; on release day `release.yml`
attests it for the tarballs (`actions/attest-sbom`, Sigstore, the signed part next to npm's provenance) and keeps
it as a workflow artifact.

## Release day (prepared, not active)

`.github/workflows/release.yml` publishes from `tsazor/tsazor`, started by hand (workflow_dispatch, like all of CI).
It runs only there and when the repository variable `RELEASE_ENABLED` is `true`. Steps: build, tests, API snapshot,
tarball smoke, `release.mjs pack`, the SBOM, then `npm publish --provenance` for each tarball (dist-tag `next` for a
prerelease, else `latest`), and the SBOM's attestation.

Before the first release, in the repository's settings: turn on **private vulnerability reporting** (Security →
Advisories), the channel [SECURITY.md](../SECURITY.md) names.

To check on release day (the sources disagree): npm lets a Trusted Publisher be configured only for a package that
exists. So the first release goes through the workflow with a short-lived granular token (`NPM_TOKEN`, provenance
works with it in a public repository); then each package gets its Trusted Publisher (`tsazor/tsazor`,
`release.yml`), and the token is deleted.

Open for release day: which files the curated first commit of `tsazor/tsazor` carries (not the handoffs and
internal notes).

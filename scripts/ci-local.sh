#!/usr/bin/env bash
# CI's `check` job (.github/workflows/ci.yml) on this machine: a fresh clone of one
# commit in the Linux file system, then the job's steps in order. It catches what
# only CI catches — case-sensitive paths, a clean install, and the committed lockfile
# without uncommitted work.
#
#   pnpm ci:local          # HEAD (on Windows it runs in WSL — scripts/ci-local.mjs)
#   pnpm ci:local <ref>    # any commit, branch or tag
#
# Needs Node 22 (CI's version) and pnpm via corepack on the Linux side. The clone
# lives in $TSAZOR_CI_DIR (default ~/tsazor-ci) and is replaced on every run;
# pnpm's store stays, as CI's cache does.
set -euo pipefail

# All in a function: bash reads a script while it runs, and this file lives in a working
# copy that may change during a run (an edit, a checkout). A function is read in full first.
main() {
  local repo work
  repo=$(cd "$(dirname "$0")/.." && pwd)
  work=${TSAZOR_CI_DIR:-$HOME/tsazor-ci}

  # WSL appends the Windows PATH: drop it, or a Windows node or pnpm can run here.
  PATH="$HOME/.local/bin:$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"
  export PATH CI=true TZ=UTC

  local node_major
  node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)
  if [[ "$node_major" != 22 ]]; then
    echo "ci-local: needs Node 22 (CI's version) on the Linux side, found '${node_major:-none}'." >&2
    exit 1
  fi
  command -v pnpm >/dev/null || { echo "ci-local: pnpm not found — run 'corepack enable pnpm'." >&2; exit 1; }

  local sha
  sha=$(git -C "$repo" rev-parse --verify "${1:-HEAD}^{commit}")
  echo "ci-local: $(git -C "$repo" log -1 --format='%h %s' "$sha")"
  echo "ci-local: clone into $work (Node $(node --version), pnpm $(pnpm --version))"
  rm -rf "$work"
  git clone --quiet --no-checkout "$repo" "$work"
  git -C "$work" checkout --quiet --detach "$sha"
  cd "$work"

  # The check job's run lines, from the commit's own ci.yml (as CI does) — the two cannot drift apart.
  local steps
  mapfile -t steps < <(
    awk '/^  check:/ { inside = 1; next } /^  [a-z]/ { inside = 0 } inside && /^ *(- )?run: / { print }' \
      .github/workflows/ci.yml | sed -E 's/^ *(- )?run: //'
  )
  if (( ${#steps[@]} == 0 )); then
    echo "ci-local: found no run steps in ci.yml's check job." >&2
    exit 1
  fi

  local start=$SECONDS step step_start
  for step in "${steps[@]}"; do
    echo
    echo "::: $step"
    step_start=$SECONDS
    if ! bash -c "$step"; then
      echo
      echo "ci-local: FAILED at '$step' — ${sha:0:7}, clone kept in $work" >&2
      exit 1
    fi
    echo "::: $step — $((SECONDS - step_start)) s"
  done

  echo
  echo "ci-local: check job green for ${sha:0:7} in $((SECONDS - start)) s"
}

git() { command git -c safe.directory='*' "$@"; }

main "$@"; exit

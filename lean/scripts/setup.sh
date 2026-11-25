#!/usr/bin/env bash
# Install Lean and the parts of Mathlib that Leangame imports, then build Leangame and the Lean REPL.
# Used by CI (.github/workflows/lean.yml) and by the Lean machine at boot (Interlinea-proto,
# infra/terraform/lean_boot.sh.tftpl). Safe to run again: each step skips work that's already done.
#
# "Minimal Mathlib": Mathlib's source is cloned in full (a few hundred MB), but only the compiled files that our
# imports need are downloaded, instead of all of Mathlib's.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.elan/bin:$PATH"
if ! command -v elan >/dev/null; then
  echo "== installing elan (the Lean version manager)"
  curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -o /tmp/elan-init.sh
  sh /tmp/elan-init.sh -y --default-toolchain none
fi

# The Mathlib files we import directly (their own imports come along automatically)
mapfile -t mods < <(grep -rhoE '^import Mathlib(\.[A-Za-z0-9_]+)+' Leangame.lean Leangame | sed 's/^import //' | sort -u)
files=()
for m in "${mods[@]}"; do files+=("${m//.//}.lean"); done
echo "== Mathlib files: ${files[*]}"

echo "== fetching dependencies"
lake exe cache get "${files[@]}"
echo "== building Leangame and the REPL"
lake build Leangame
lake exe repl < /dev/null   # builds the REPL (with no input it exits at once)
echo "== done: $(lake env lean --version)"

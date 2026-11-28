#!/usr/bin/env bash
# The Natural Number Game server (PROTOTYPE, written by Claude): lean4game, pinned, built, with the game in nng/ built
# against it. Used by the Lean machine at boot (Interlinea-proto, infra/terraform/lean_boot.sh.tftpl, after the
# referee is up, so the linear algebra game doesn't wait) and by CI (.github/workflows/nng.yml).
#
#   scripts/nng-server.sh setup   Node, bubblewrap, lean4game and the game, built (safe to run again)
#   scripts/nng-server.sh start   the server on 127.0.0.1:8000, in the foreground (the referee forwards to it)
#
# Environment:
#   LEAN4GAME_DIR  where lean4game lives (default: /opt/lean4game)
#   NNG_STATUS     a file to write the progress to, as JSON; the referee shows it (server/referee.py, /health)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.elan/bin:/usr/local/bin:$PATH"

# lean4game (GPL-3.0, unmodified) at a known commit; nng/ is built for the GameServer it pins (nng/lake-manifest.json)
LEAN4GAME_URL=https://github.com/leanprover-community/lean4game
LEAN4GAME_COMMIT=7874b510953b285ca1b8e6d3d8bf88820d3aa938
NODE_MAJOR=26
L4G="${LEAN4GAME_DIR:-/opt/lean4game}"
GAME_OWNER=leangame GAME_NAME=nng   # played at /g/leangame/nng

say() {
  echo "== $2"
  if [ -n "${NNG_STATUS:-}" ]; then
    printf '{"state":"%s","detail":"%s","updated":"%s"}' "$1" "$2" "$(date -u +%FT%TZ)" > "$NNG_STATUS.tmp" && mv "$NNG_STATUS.tmp" "$NNG_STATUS"
  fi
}
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi; }

# When setup fails: which step, and the last lines of its output, next to the status (NNG_STATUS.why), for the
# referee to show (the boot script writes its own "failed" status afterwards)
STEP="starting"
LOGF="${NNG_LOG:-/tmp/nng-setup.log}"
failed() {
  local code=$?
  if [ -n "${NNG_STATUS:-}" ]; then
    python3 - "$NNG_STATUS.why" "$STEP" "$LOGF" <<'PY' || true
import json, sys
out, step, logf = sys.argv[1:]
try:
    lines = [l.rstrip() for l in open(logf, errors="replace") if l.strip()][-6:]
except OSError:
    lines = []
json.dump({"step": step, "tail": lines}, open(out, "w"))
PY
  fi
  echo "== setup failed at: $STEP (exit $code)"
  exit "$code"
}

# a 4 GB machine with Lean already loaded: building the client (and, later, a game level's Lean) needs room
add_swap() {
  [ "$(id -u)" = 0 ] || return 0
  [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 6000000 ] || return 0
  [ "$(awk 'NR > 1' /proc/swaps | wc -l)" -eq 0 ] || return 0
  STEP="adding swap"
  rm -f /swapfile
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo "swap on: 4 GB"
}

node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]; }

install_node() {
  node_ok && return
  STEP="installing Node"
  say building "Installing Node $NODE_MAJOR"
  local base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x" file
  file="$(curl -fsSL "$base/SHASUMS256.txt" | grep -oE "node-v[0-9.]+-linux-x64\.tar\.gz" | head -1)"
  curl -fsSL "$base/$file" -o "/tmp/$file"
  (cd /tmp && curl -fsSL "$base/SHASUMS256.txt" | grep " $file\$" | sha256sum -c -)
  as_root rm -rf /opt/node && as_root mkdir -p /opt/node
  as_root tar -xzf "/tmp/$file" -C /opt/node --strip-components=1
  as_root ln -sf /opt/node/bin/node /opt/node/bin/npm /opt/node/bin/npx /usr/local/bin/
  rm -f "/tmp/$file"
}

install_bwrap() {
  # bubblewrap sandboxes the players' Lean code (lean4game's server/scripts/bubblewrap.sh)
  STEP="installing bubblewrap"
  if ! command -v bwrap >/dev/null; then
    say building "Installing bubblewrap"
    as_root apt-get -o DPkg::Lock::Timeout=600 -y -q install bubblewrap \
      || { as_root apt-get -o DPkg::Lock::Timeout=600 -q update && as_root apt-get -o DPkg::Lock::Timeout=600 -y -q install bubblewrap; }
  fi
  # Ubuntu 24.04+ lets only programs whose AppArmor profile says so create user namespaces
  if [ -d /etc/apparmor.d ] && ! bwrap --unshare-user --ro-bind / / true 2>/dev/null; then
    as_root tee /etc/apparmor.d/bwrap >/dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/bwrap>
}
EOF
    as_root apparmor_parser -r /etc/apparmor.d/bwrap || as_root systemctl reload apparmor
  fi
  bwrap --unshare-user --ro-bind / / true && echo "bubblewrap works"
}

build_lean4game() {
  if [ "$(git -C "$L4G" rev-parse HEAD 2>/dev/null || true)" != "$LEAN4GAME_COMMIT" ] || [ ! -f "$L4G/server/dist/index.js" ] || [ ! -f "$L4G/client/dist/index.html" ]; then
    STEP="fetching lean4game"
    say building "Fetching the game server (lean4game)"
    as_root mkdir -p "$L4G" && as_root chown "$(id -u):$(id -g)" "$L4G"
    git -C "$L4G" init -q 2>/dev/null || true
    git -C "$L4G" fetch -q --depth 1 "$LEAN4GAME_URL" "$LEAN4GAME_COMMIT"
    git -C "$L4G" checkout -q --force FETCH_HEAD
    STEP="building lean4game (npm ci, the client, the server)"
    say building "Building the game server"
    # Cypress (its tests) isn't needed and downloads ~500 MB; keep Node's memory within a small machine
    (cd "$L4G" && CYPRESS_INSTALL_BINARY=0 npm ci --no-audit --no-fund \
      && NODE_OPTIONS=--max-old-space-size=1536 npm run build:client && npm run build:server)
  fi
  mkdir -p "$L4G/server/games/$GAME_OWNER"
  ln -sfn "$root/nng" "$L4G/server/games/$GAME_OWNER/$GAME_NAME"
}

build_game() {
  STEP="building the game (lake exe cache get, lake build)"
  say building "Building the Natural Number Game (Lean and Mathlib)"
  cd "$root/nng"
  # the game uses Mathlib's tactics: its compiled files come from Mathlib's cache instead of being built here
  lake exe cache get
  lake build
  test -f .lake/gamedata/game.json
}

case "${1:-}" in
  setup)
    exec > >(tee -a "$LOGF") 2>&1
    trap failed ERR
    set -E
    say building "Setting up the Natural Number Game"
    add_swap || echo "== no swap (going on without it)"   # helpful, not needed: never the reason setup stops
    if ! command -v elan >/dev/null; then
      curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -o /tmp/elan-init.sh
      sh /tmp/elan-init.sh -y --default-toolchain none
    fi
    install_node
    install_bwrap
    build_lean4game
    build_game
    say built "The Natural Number Game is built"
    ;;
  start)
    cd "$L4G/server"
    say starting "Starting the Natural Number Game server"
    # one player, a 4 GB machine: one level's Lean worker open at a time
    NODE_ENV=production HOST=127.0.0.1 PORT=8000 LEAN_MAX_OPEN_DOCS=1 exec node dist/index.js
    ;;
  *) echo "usage: $0 setup|start" >&2; exit 2 ;;
esac

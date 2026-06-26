#!/usr/bin/env bash
# Shared helpers for claude-local-mcp. Source this from setup scripts.
set -euo pipefail

# --- repo root (the dir that contains this lib/) ---
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPO_ROOT

# --- pretty logging ---
_c() { printf '\033[%sm' "$1"; }
log()  { printf '%s%s%s\n' "$(_c '1;34')" "→ $*" "$(_c 0)"; }
ok()   { printf '%s%s%s\n' "$(_c '1;32')" "✓ $*" "$(_c 0)"; }
warn() { printf '%s%s%s\n' "$(_c '1;33')" "! $*" "$(_c 0)"; }
die()  { printf '%s%s%s\n' "$(_c '1;31')" "✗ $*" "$(_c 0)" >&2; exit 1; }

# --- binary resolution (PATH first, then common install locations) ---
# Usage: resolve_bin uv  -> prints absolute path or empty
resolve_bin() {
  local name="$1" p alt=""
  p="$(command -v "$name" 2>/dev/null || true)"
  [ -n "$p" ] && { echo "$p"; return 0; }
  # python is `python3` on mac/linux but usually `python` on Windows; try both.
  case "$name" in python3) alt=python;; python) alt=python3;; esac
  if [ -n "$alt" ]; then
    p="$(command -v "$alt" 2>/dev/null || true)"
    [ -n "$p" ] && { echo "$p"; return 0; }
  fi
  for p in "$HOME/.local/bin/$name" "/usr/local/go/bin/$name" \
           "/opt/homebrew/bin/$name" "/usr/local/bin/$name" "/usr/bin/$name"; do
    [ -x "$p" ] && { echo "$p"; return 0; }
  done
  return 1
}

# --- prerequisite gate: require_bins go uv ... ---
require_bins() {
  local missing=() b
  for b in "$@"; do resolve_bin "$b" >/dev/null || missing+=("$b"); done
  if [ "${#missing[@]}" -gt 0 ]; then
    die "missing prerequisites: ${missing[*]} (install them, then re-run)"
  fi
}

# --- refuse to touch config while Claude/Cowork is running ---
assert_claude_quit() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)   # Windows (Git Bash / WSL-MSYS)
      if tasklist 2>/dev/null | grep -qi 'Claude.exe'; then
        die "Claude/Cowork is running. Fully quit it, then re-run."
      fi ;;
    *)
      if pgrep -fl 'Claude.app' >/dev/null 2>&1; then
        die "Claude/Cowork is running. Fully quit it (Cmd+Q), then re-run."
      fi ;;
  esac
}

#!/usr/bin/env bash
# claude-local-mcp — install local MCP servers onto this machine.
#
#   ./bootstrap.sh                 # interactive pick-list
#   ./bootstrap.sh teamwork readai # install just these
#   ./bootstrap.sh --list          # show available servers + what they need
#   ./bootstrap.sh --all           # install everything
#
# Each server lives in servers/<name>/ with: manifest.sh, setup.sh, config.json.
# Adding a new MCP later = drop a new folder with those three files; it is
# auto-discovered here with no edits to this script.
set -euo pipefail
cd "$(dirname "$0")"
. lib/common.sh

discover() { for d in servers/*/; do [ -f "$d/setup.sh" ] && basename "$d"; done | sort; }

show_manifest() { # $1=name -> sets NAME_* vars in a subshell and prints a line
  ( SERVER_NAME=""; SERVER_DESC=""; SERVER_AUTH=""; SERVER_PREREQS=""
    . "servers/$1/manifest.sh"
    printf '  %-10s %s\n' "$1" "$SERVER_DESC"
    [ -n "$SERVER_PREREQS" ] && printf '             needs: %s\n' "$SERVER_PREREQS"
    [ -n "$SERVER_AUTH" ]    && printf '             auth:  %s\n' "$SERVER_AUTH" )
}

list_all() { log "Available servers:"; for s in $(discover); do show_manifest "$s"; done; }

[ "${1:-}" = "--list" ] && { list_all; exit 0; }

# --- choose which servers ---
AVAILABLE=($(discover))
SELECTED=()
if [ "${1:-}" = "--all" ]; then
  SELECTED=("${AVAILABLE[@]}")
elif [ "$#" -gt 0 ]; then
  for a in "$@"; do
    [ -d "servers/$a" ] || die "unknown server: $a (try ./bootstrap.sh --list)"
    SELECTED+=("$a")
  done
else
  list_all
  echo ""
  log "Enter the servers to install (space-separated), or 'all':"
  read -r -a picks
  if [ "${picks[*]:-}" = "all" ]; then SELECTED=("${AVAILABLE[@]}"); else SELECTED=("${picks[@]}"); fi
fi
[ "${#SELECTED[@]}" -gt 0 ] || die "nothing selected"

log "Will install: ${SELECTED[*]}"

# --- build/vendor each selected server ---
for s in "${SELECTED[@]}"; do
  echo ""
  log "=== $s: building ==="
  ( . "servers/$s/manifest.sh"
    [ -n "${SERVER_PREREQS:-}" ] && require_bins $SERVER_PREREQS
    bash "servers/$s/setup.sh" ) || die "$s setup failed"
  ok "$s built"
done

# --- merge config (needs Cowork quit) ---
echo ""
assert_claude_quit
log "Writing config entries for: ${SELECTED[*]}"
/usr/bin/python3 install_config.py "$REPO_ROOT" "${SELECTED[@]}"

# --- per-server auth next-steps ---
echo ""
ok "Done. Per-machine auth still needed for some servers:"
for s in "${SELECTED[@]}"; do
  ( . "servers/$s/manifest.sh"
    [ -n "${SERVER_AUTH:-}" ] && printf '  • %-10s %s\n' "$s" "$SERVER_AUTH" )
done
echo ""
log "Then launch Cowork."

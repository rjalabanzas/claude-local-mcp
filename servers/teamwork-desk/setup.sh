#!/usr/bin/env bash
# Teamwork Desk reuses the SAME patched tw-mcp binary as the teamwork server,
# just launched with the twdesk-* toolsets and a Desk API key. Ensure the shared
# binary is built (build it via the teamwork server's setup if it isn't already).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"
TW_BIN="$HERE/../teamwork/bin/tw-mcp"
if [ -x "$TW_BIN" ] || [ -x "$TW_BIN.exe" ]; then
  ok "reusing existing tw-mcp binary -> servers/teamwork/bin/tw-mcp"
else
  log "shared tw-mcp binary not built yet — building it via the teamwork server setup"
  bash "$HERE/../teamwork/setup.sh"
fi

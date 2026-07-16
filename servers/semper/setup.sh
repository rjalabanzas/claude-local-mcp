#!/usr/bin/env bash
# Semper PMS MCP server — vendored, read-only, pure JS. Just install the MCP SDK.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"
NPM="$(resolve_bin npm)"
cd "$HERE/src"
log "installing node deps"
"$NPM" install --no-audit --no-fund >/dev/null 2>&1
[ -f "$HERE/src/server.js" ] || die "semper: src/server.js missing"
ok "semper ready -> servers/semper/src/server.js"

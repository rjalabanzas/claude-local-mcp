#!/usr/bin/env bash
# Outlook MCP is vendored (community simply-outlook-mcp + local calendar fix).
# Install deps and compile TypeScript -> dist/index.js. We run build:tsc directly
# (skips the lint/check-types gate so a lint nit can't fail the bootstrap).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"
NPM="$(resolve_bin npm)"
cd "$HERE/src"
log "installing node deps"
"$NPM" install --no-audit --no-fund >/dev/null 2>&1
log "compiling TypeScript"
"$NPM" run build:tsc >/dev/null
[ -f "$HERE/src/dist/index.js" ] || die "outlook build produced no dist/index.js"
ok "outlook built -> servers/outlook/src/dist/index.js"

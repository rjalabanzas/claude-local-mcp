#!/usr/bin/env bash
# WhatsApp MCP is vendored (community whatsapp-mcp). Two parts:
#   - whatsapp-bridge  (Go) — maintains the WhatsApp connection + QR auth
#   - whatsapp-mcp-server (Python/uv) — the MCP server the config launches
# We compile the Go bridge here; uv resolves the server's deps on first run.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"
GO="$(resolve_bin go)"
cd "$HERE/src/whatsapp-bridge"
log "building whatsapp bridge ($("$GO" env GOOS)/$("$GO" env GOARCH))"
"$GO" build -o whatsapp-bridge .
chmod +x whatsapp-bridge
[ -f "$HERE/src/whatsapp-mcp-server/main.py" ] || die "whatsapp-mcp-server/main.py missing"
ok "whatsapp bridge built; server ready (uv resolves deps on first run)"

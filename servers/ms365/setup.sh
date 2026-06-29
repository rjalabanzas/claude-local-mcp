#!/usr/bin/env bash
# ms365 runs straight from npm via npx — nothing to build or vendor. The package
# is fetched on first launch. Auth is an interactive device-code login, but we
# route each instance's credentials through our own file-based auth-cache wrapper
# (see ms365-auth-cache) so multiple accounts stay isolated instead of sharing
# the OS keychain. All this setup does is make the wrapper + login helper runnable.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"

chmod +x "$HERE/ms365-auth-cache" "$HERE/login.sh" "$HERE/login.py" 2>/dev/null || true
ok "ms365 ready (npx fetches @softeria/ms-365-mcp-server on first launch; per-account creds via ms365-auth-cache)"

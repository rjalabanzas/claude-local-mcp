#!/usr/bin/env bash
# ms365 runs straight from npm via npx — nothing to build or vendor. The package
# is fetched on first launch; auth is an interactive device-code login.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"
ok "ms365 needs no build (npx fetches @softeria/ms-365-mcp-server on first launch)"

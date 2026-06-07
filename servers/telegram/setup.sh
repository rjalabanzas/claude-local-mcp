#!/usr/bin/env bash
# Telegram MCP is vendored (chigwell/telegram-mcp v3.1.2 + local patches).
# uv resolves Python deps from pyproject on first run; nothing to compile.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"
[ -f "$HERE/src/main.py" ] || die "telegram src/main.py missing"
ok "telegram source present (uv resolves deps on first run)"

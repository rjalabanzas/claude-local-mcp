#!/usr/bin/env bash
# readai is vendored as-is (PEP-723 inline deps; uv resolves them on first run).
# Nothing to build. We just sanity-check the source is present.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"
[ -f "$HERE/server.py" ] || die "readai server.py missing from repo"
ok "readai source present (deps resolved by uv on first run)"
warn "auth not yet done? run:  uv run \"$HERE/auth.py\"   (one-time, opens browser)"

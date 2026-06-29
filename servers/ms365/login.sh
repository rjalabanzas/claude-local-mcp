#!/usr/bin/env bash
# Device-code login for one ms365 instance:  ./servers/ms365/login.sh <prefix>
# Uses that instance's env from Claude's config so the token is saved into its
# own .creds/<prefix> dir (separate from every other account).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"

PREFIX="${1:-}"
[ -n "$PREFIX" ] || die "usage: login.sh <prefix>   (the 4-letter prefix you set at install)"
PY="$(resolve_bin python3 || resolve_bin python)" || die "python 3 is required for login"
exec "$PY" "$HERE/login.py" "$PREFIX"

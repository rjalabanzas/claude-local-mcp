#!/usr/bin/env bash
# Authenticate one google instance:  ./servers/google/login.sh <prefix> [credentials.json]
# Stores that account's OAuth client (separate client per account), then runs the
# browser login. Uses the instance's env from Claude's config so the client +
# tokens are saved under servers/google/.creds/<prefix>/ — isolated per account.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"

PREFIX="${1:-}"
[ -n "$PREFIX" ] || die "usage: login.sh <prefix> [path-to-credentials.json]   (prefix = the one you set at install)"
PY="$(resolve_bin python3 || resolve_bin python)" || die "python 3 is required for login"
exec "$PY" "$HERE/login.py" "$@"

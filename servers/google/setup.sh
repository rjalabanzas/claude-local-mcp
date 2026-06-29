#!/usr/bin/env bash
# google (gogcli) needs the `gog` binary. We download the matching prebuilt
# release into bin/ (sha256-verified) so it's self-contained on mac/win/linux —
# no Homebrew or Go required. Auth + per-account isolation happen at login time
# via login.sh + a per-instance GOG_HOME (set in the Claude config entry).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"

PY="$(resolve_bin python3 || resolve_bin python)" || die "python 3 is required"
"$PY" "$HERE/fetch_gog.py" "$HERE/bin"
chmod +x "$HERE/login.sh" "$HERE/login.py" 2>/dev/null || true
ok "google ready (gog in servers/google/bin; one account per install via prefix + GOG_HOME)"

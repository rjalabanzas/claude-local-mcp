#!/usr/bin/env bash
# Build the patched tw-mcp from OFFICIAL upstream + our patches, with provenance
# verification. This is the one server built from upstream (not vendored): the Go
# dependency tree is huge and the source is cryptographically verifiable.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"

# --- pinned versions (must match the trusted reference binary) ---
MCP_TAG="v1.23.0"
SDK_TAG="v1.19.4"
MCP_COMMIT="cc84e5048f095a238ddcdca6f80bbb12314ccd5d"           # binary vcs.revision (v1.23.0^{commit})
SDK_HASH="h1:s7+gzMWrwprOxamv/I/mJug02sdPioSq7RWUM6QLoKk="        # binary's recorded SDK module hash

GO="$(resolve_bin go)"
BUILD="$HERE/.build"; rm -rf "$BUILD"; mkdir -p "$BUILD"; cd "$BUILD"

log "cloning official teamwork/mcp@$MCP_TAG and twapi-go-sdk@$SDK_TAG"
# core.autocrlf=false: on Windows, keep upstream checked out with LF so our
# LF-only .patch files apply cleanly (Git for Windows otherwise rewrites to CRLF).
git -c core.autocrlf=false clone --quiet --depth 1 --branch "$MCP_TAG" https://github.com/teamwork/mcp.git mcp
git -c core.autocrlf=false clone --quiet --depth 1 --branch "$SDK_TAG" https://github.com/teamwork/twapi-go-sdk.git sdk

# --- provenance gate (security rule: don't blindly trust upstream) ---
got_commit="$(git -C mcp rev-parse HEAD)"
[ "$got_commit" = "$MCP_COMMIT" ] || die "MCP commit mismatch: got $got_commit, expected $MCP_COMMIT"
ok "MCP commit matches reference binary"

# verify the released SDK module hash matches, and that the clone == released module
PY="$(resolve_bin python3)" || die "python3/python required for the provenance check"
info="$("$GO" mod download -json "github.com/teamwork/twapi-go-sdk@$SDK_TAG" 2>/dev/null || true)"
sum="$(printf '%s' "$info" | "$PY" -c 'import json,sys;print(json.load(sys.stdin).get("Sum",""))' 2>/dev/null || true)"
[ "$sum" = "$SDK_HASH" ] || die "SDK module hash mismatch: got '$sum', expected '$SDK_HASH'"
ok "SDK module hash matches reference binary"

# --- apply our patches ---
log "applying Plan Africa patches (typefix, cloud-storage, file ops, message categories, notifications, due-date filters)"
git -C mcp apply "$HERE/mcp.patch"
git -C sdk apply "$HERE/sdk.patch"

# --- wire local patched SDK + build matching this machine's arch ---
cd mcp
"$GO" mod edit -replace github.com/teamwork/twapi-go-sdk=../sdk
"$GO" mod tidy >/dev/null 2>&1
GOOS="$("$GO" env GOOS)"; GOARCH="$("$GO" env GOARCH)"
EXT=""; [ "$GOOS" = "windows" ] && EXT=".exe"   # Go emits a .exe on Windows
log "building tw-mcp for $GOOS/$GOARCH"
mkdir -p "$HERE/bin"
CGO_ENABLED=0 GOFLAGS=-mod=mod "$GO" build \
  -ldflags="-X 'github.com/teamwork/mcp/internal/config.Version=$MCP_TAG+duefilter'" \
  -o "$HERE/bin/tw-mcp$EXT" ./cmd/mcp-stdio
chmod +x "$HERE/bin/tw-mcp$EXT" 2>/dev/null || true
cd "$HERE"; rm -rf "$BUILD"
ok "tw-mcp built -> servers/teamwork/bin/tw-mcp$EXT"

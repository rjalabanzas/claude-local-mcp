#!/usr/bin/env bash
# Build the patched tw-mcp from OFFICIAL upstream + our patches, with provenance
# verification. This is the one server built from upstream (not vendored): the Go
# dependency tree is huge and the source is cryptographically verifiable.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../../lib/common.sh"

# --- pinned versions (must match the trusted reference binary) ---
MCP_TAG="v1.21.1"
SDK_TAG="v1.18.1"
MCP_COMMIT="2f1230dbd42303f6ca6a7668de30f61686b00eeb"           # binary vcs.revision
SDK_HASH="h1:o5nGwwlq1UvcXM+VAmYSPqhXd886I1jh55T9fvtmjjw="        # binary's recorded SDK module hash

GO="$(resolve_bin go)"
BUILD="$HERE/.build"; rm -rf "$BUILD"; mkdir -p "$BUILD"; cd "$BUILD"

log "cloning official teamwork/mcp@$MCP_TAG and twapi-go-sdk@$SDK_TAG"
git clone --quiet --depth 1 --branch "$MCP_TAG" https://github.com/teamwork/mcp.git mcp
git clone --quiet --depth 1 --branch "$SDK_TAG" https://github.com/teamwork/twapi-go-sdk.git sdk

# --- provenance gate (security rule: don't blindly trust upstream) ---
got_commit="$(git -C mcp rev-parse HEAD)"
[ "$got_commit" = "$MCP_COMMIT" ] || die "MCP commit mismatch: got $got_commit, expected $MCP_COMMIT"
ok "MCP commit matches reference binary"

# verify the released SDK module hash matches, and that the clone == released module
info="$("$GO" mod download -json "github.com/teamwork/twapi-go-sdk@$SDK_TAG" 2>/dev/null || true)"
sum="$(printf '%s' "$info" | /usr/bin/python3 -c 'import json,sys;print(json.load(sys.stdin).get("Sum",""))' 2>/dev/null || true)"
[ "$sum" = "$SDK_HASH" ] || die "SDK module hash mismatch: got '$sum', expected '$SDK_HASH'"
ok "SDK module hash matches reference binary"

# --- apply our patches ---
log "applying due-date/overdue patches"
git -C mcp apply "$HERE/mcp.patch"
git -C sdk apply "$HERE/sdk.patch"

# --- wire local patched SDK + build matching this machine's arch ---
cd mcp
"$GO" mod edit -replace github.com/teamwork/twapi-go-sdk=../sdk
"$GO" mod tidy >/dev/null 2>&1
GOOS="$("$GO" env GOOS)"; GOARCH="$("$GO" env GOARCH)"
log "building tw-mcp for $GOOS/$GOARCH"
mkdir -p "$HERE/bin"
CGO_ENABLED=0 GOFLAGS=-mod=mod "$GO" build \
  -ldflags="-X 'github.com/teamwork/mcp/internal/config.Version=$MCP_TAG+duefilter'" \
  -o "$HERE/bin/tw-mcp" ./cmd/mcp-stdio
chmod +x "$HERE/bin/tw-mcp"
cd "$HERE"; rm -rf "$BUILD"
ok "tw-mcp built -> servers/teamwork/bin/tw-mcp"

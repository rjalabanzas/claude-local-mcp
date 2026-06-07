#!/bin/bash
# WhatsApp MCP wrapper: starts the Go bridge if needed, runs the Python MCP
# server in foreground, and stops the bridge on exit (only if we started it).
# Wired into Claude Desktop's claude_desktop_config.json so the bridge's
# lifetime follows Claude Desktop's lifetime — no 24/7 daemon, no manual start.

set -u

BRIDGE_DIR="/Users/rjalabanzas/repos/mcp-workspace/servers/whatsapp/community/whatsapp-mcp/whatsapp-bridge"
MCP_DIR="/Users/rjalabanzas/repos/mcp-workspace/servers/whatsapp/community/whatsapp-mcp/whatsapp-mcp-server"
UV="/Users/rjalabanzas/.local/bin/uv"
LOG="/tmp/whatsapp-bridge.log"

BRIDGE_PID=""

# All wrapper output goes to stderr so it does not corrupt the MCP stdio stream.
log() { printf '[whatsapp-mcp-wrapper] %s\n' "$*" >&2; }

# Is the bridge already listening on :8080?
bridge_up() {
  /usr/sbin/lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1
}

if bridge_up; then
  log "Bridge already running on :8080 — leaving it alone."
else
  log "Bridge not running. Starting it..."
  ( cd "$BRIDGE_DIR" && ./whatsapp-bridge ) >"$LOG" 2>&1 &
  BRIDGE_PID=$!
  log "Bridge started (PID=$BRIDGE_PID, log=$LOG)."

  # Wait up to ~10s for it to bind to :8080 before launching the MCP server.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    bridge_up && break
    sleep 1
  done
  if ! bridge_up; then
    log "Bridge failed to come up. Continuing anyway; MCP tools will error until it does."
  fi
fi

cleanup() {
  if [ -n "$BRIDGE_PID" ] && kill -0 "$BRIDGE_PID" 2>/dev/null; then
    log "Claude Desktop is closing — stopping bridge (PID=$BRIDGE_PID)."
    kill "$BRIDGE_PID" 2>/dev/null || true
    # Give it a moment to flush, then force.
    for _ in 1 2 3; do
      kill -0 "$BRIDGE_PID" 2>/dev/null || break
      sleep 1
    done
    kill -9 "$BRIDGE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Foreground the MCP server so stdio passes through to Claude Desktop.
"$UV" --directory "$MCP_DIR" run main.py

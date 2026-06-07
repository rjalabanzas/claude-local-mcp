# readai-mcp

A thin **local** MCP server wrapping the Read.ai REST API (read-only), so Read.ai
meeting data is reachable from a machine-bound server instead of an account-bound
remote connector.

## Tools
- `list_meetings` — newest-first list (auto-paginates; API caps pages at 10)
- `get_meeting` — one ended meeting by ULID, with `expand` (transcript, summary, action_items, key_questions, topics, metrics, chapter_summaries, recording_download)
- `get_live_meeting` — real-time transcript for an active meeting (only if the live dashboard was open)

## Auth model
Read.ai uses OAuth 2.1 (dynamic client registration), **10-minute access tokens**,
and **single-use rotating refresh tokens**. Credentials live in
`~/.config/readai-mcp/tokens.json` (chmod 600). The server refreshes on demand and
persists the rotated refresh token atomically after every refresh.

## Setup
1. **One-time auth:**
   ```
   uv run "/Users/rjalabanzas/ClaudeOS/Code Repos/readai-mcp/auth.py"
   ```
   Follow the browser sign-in/consent, paste the "Copy Command" from Read.ai's
   OAuth page when prompted. Secrets stay local.
2. **Add to Cowork** (do it while Cowork is fully quit — Cmd+Q):
   ```
   python3 "/Users/rjalabanzas/ClaudeOS/Code Repos/mcp-workspace/add_readai_server.py"
   ```
3. Launch Cowork. The `readai` tools (`mcp__readai__*`) should appear.

## Re-auth
If refresh ever fails (rotation got out of sync, or token revoked), just re-run
`auth.py` — it reuses the existing client registration and mints a fresh refresh token.

## Notes
- Read.ai's REST API is currently an **open beta** — endpoints may change.
- `transcript`/`summary`/etc. are only populated for **ended** meetings.

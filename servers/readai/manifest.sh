SERVER_NAME="readai"
SERVER_DESC="Read.ai meetings/transcripts (own local MCP, OAuth 2.1)"
SERVER_PREREQS="uv"
SERVER_AUTH="one-time OAuth: run  uv run servers/readai/auth.py  (opens browser; persists rotating token to ~/.config/readai-mcp/tokens.json)"

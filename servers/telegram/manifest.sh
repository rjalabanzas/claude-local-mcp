SERVER_NAME="telegram"
SERVER_DESC="Telegram (chigwell/telegram-mcp v3.1.2 + local patches)"
SERVER_PREREQS="uv"
SERVER_AUTH="paste TELEGRAM_API_ID / API_HASH / session string at the prompt. No phone login if you reuse an existing session string; mint a new one with: uv run --directory servers/telegram/src session_string_generator.py"

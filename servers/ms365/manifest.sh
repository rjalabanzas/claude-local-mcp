SERVER_NAME="ms365"
SERVER_DESC="Microsoft 365 — Outlook/Calendar/SharePoint/Teams/OneDrive/Planner (@softeria/ms-365-mcp-server). Install once per account: prompts for a 4-letter prefix (+ optional tenant) → MCP 'ms365-<prefix>'."
SERVER_PREREQS="npx"
SERVER_AUTH="per instance, run  ./servers/ms365/login.sh <prefix>  (device-code login; token saved to servers/ms365/.creds/<prefix>/, not the keychain — so accounts stay separate)"

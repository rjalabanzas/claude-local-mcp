SERVER_NAME="google"
SERVER_DESC="Google Workspace — Gmail/Calendar/Drive/Docs/Sheets/Contacts/Tasks (gogcli 'gog'). Install once per account: prompts for a 4-letter prefix + email → MCP 'google-<prefix>'."
SERVER_PREREQS="curl python3"
SERVER_AUTH="per instance, run  ./servers/google/login.sh <prefix> <path-to-credentials.json>  (stores that account's Google OAuth client, then browser login; tokens in servers/google/.creds/<prefix>/, not the keychain)"

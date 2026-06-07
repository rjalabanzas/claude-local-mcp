# claude-local-mcp

One repo to set up my local Claude/Cowork MCP servers on any Mac. Clone it, run
one script, pick the servers that machine needs, do the per-server logins.

## Quick start

```bash
git clone <this-repo-url> ~/ClaudeOS/Code\ Repos/claude-local-mcp
cd ~/ClaudeOS/Code\ Repos/claude-local-mcp

./bootstrap.sh --list            # see what's available
./bootstrap.sh teamwork readai   # install just these
./bootstrap.sh                   # interactive pick-list
./bootstrap.sh --all             # everything
```

You install **only what a machine needs** — it's not all-or-nothing.

> ⚠️ Quit Cowork/Claude (Cmd+Q) before running — the app rewrites its config file
> on quit, so edits made while it's open are lost. The installer refuses to run
> while it's open.

## Servers

| Server | What | Built how | Per-machine auth |
|---|---|---|---|
| `teamwork` | Projects/Desk/Spaces (`tw-mcp`, patched for due-date/overdue) | from **official** upstream + our patch, provenance-verified | paste bearer token |
| `ms365` | Outlook/Calendar/SharePoint/Teams/etc. | config only (`npx`) | device-code login (keychain) |
| `readai` | Read.ai meetings/transcripts | vendored (own code) | `uv run servers/readai/auth.py` |
| `telegram` | Telegram | vendored (chigwell + my patch) | phone login on first run |
| `outlook` | Outlook (community server, calendar fix) | vendored + `npm build` | OAuth (uses ms365 app) |
| `whatsapp` | WhatsApp | vendored + `go build` bridge | QR scan on first run |

## How it works

- Each server is a self-contained folder: `servers/<name>/`
  - `manifest.sh` — description, prerequisites, auth note
  - `setup.sh` — build/vendor that one server
  - `config.json` — its Claude config entry (with `${REPO}`/`${BIN:…}`/`${SECRET:…}` placeholders)
- `bootstrap.sh` auto-discovers `servers/*/`, builds the selected ones, then
  `install_config.py` merges their entries into Claude's config (backup first,
  prompts for any secrets via hidden input).

### Adding a new MCP later

Drop a new `servers/<name>/` folder with `manifest.sh`, `setup.sh`, and
`config.json`. No edits to `bootstrap.sh` — it's picked up automatically.

## Security

- **No secrets in the repo.** `.gitignore` blocks tokens, `.env`, session files,
  `*.db`, and the Claude config. Secrets are prompted at install time and written
  only into Claude's config.
- **`teamwork` builds from the official Teamwork GitHub** and verifies the clone's
  commit + the SDK module hash against a known-good reference before building —
  it won't build on a mismatch. Other servers are vendored from the exact source
  I run (third-party ones keep their upstream `LICENSE` + attribution).
- Go/npm builds run no untrusted lifecycle scripts beyond the projects' own.

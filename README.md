# claude-local-mcp

One repo to set up my local Claude/Cowork MCP servers on any Mac **or Windows
PC**. Clone it, run one script, pick the servers that machine needs, do the
per-server logins.

## Quick start (macOS)

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

## Quick start (Windows)

The installer is the same bash script — run it inside **Git Bash** (ships with
[Git for Windows](https://git-scm.com/download/win)). Plain PowerShell/CMD won't
run the `.sh` scripts.

1. Install the prerequisites for the servers you want, and make sure each is on
   your `PATH` (open a fresh terminal after installing):
   - **All servers:** [Git for Windows](https://git-scm.com/download/win) (gives you Git Bash)
   - `ms365` → [Node.js LTS](https://nodejs.org) (provides `npx`)
   - `telegram` → [uv](https://docs.astral.sh/uv/getting-started/installation/) + [Python 3](https://www.python.org/downloads/)
   - `teamwork` → [Go](https://go.dev/dl/) + Python 3 (for the build check) + Node.js (to mint the bearer token)
2. Open **Git Bash** and run:
   ```bash
   git clone <this-repo-url> "$HOME/claude-local-mcp"
   cd "$HOME/claude-local-mcp"
   ./bootstrap.sh ms365 telegram teamwork    # or --list / --all / interactive
   ```
3. Fully quit Claude/Cowork first (it rewrites its config — at
   `%APPDATA%\Claude\claude_desktop_config.json` on Windows — when it closes).
   The installer refuses to run while it's open.

> The installer auto-detects Windows: it writes to the `%APPDATA%\Claude` config
> path and resolves `python`/`python3` and the `.exe` build outputs for you.

## Servers

| Server | What | Built how | Per-machine auth |
|---|---|---|---|
| `teamwork` | Projects/Desk/Spaces (`tw-mcp`, patched for due-date/overdue) | from **official** upstream + our patch, provenance-verified | paste bearer token |
| `ms365` | Outlook/Calendar/SharePoint/Teams/etc. (one entry **per account**) | config only (`npx`) | `./servers/ms365/login.sh <prefix>` (device-code; per-account file) |
| `google` | Gmail/Calendar/Drive/Docs/Sheets/Contacts/Tasks (gogcli; one entry **per account**) | downloads `gog` binary | `./servers/google/login.sh <prefix> <credentials.json>` (OAuth; per-account file) |
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

### ms365: multiple accounts

`ms365` can be installed **once per Microsoft account** — each becomes its own
MCP server so Claude can tell them apart and each account's credentials live in
their own file (not the shared OS keychain).

Run the installer again for each account:

```bash
./bootstrap.sh ms365      # asks for: a 4-letter prefix (+ optional tenant)
```

- **prefix** (≤4 letters, e.g. `work`, `prsl`) → the MCP is named `ms365-<prefix>`,
  so its tools appear as `mcp__ms365-<prefix>__…` — that's how Claude differentiates them.
- **tenant** → press Enter for `common` (work/school accounts). Use `consumers`
  for a **personal** Microsoft account — on `common`, personal-account sessions
  expire ~1 hour after login (refresh tokens are rejected).

Then log in each one (device-code flow):

```bash
./servers/ms365/login.sh work     # token saved to servers/ms365/.creds/work/
./servers/ms365/login.sh prsl     # …/.creds/prsl/  — fully separate
```

Credentials bypass the keychain via a small file-based auth-cache wrapper
(`ms365-auth-cache`), which is what keeps the accounts isolated. The `.creds/`
dir is git-ignored.

### google: multiple accounts

`google` wraps [`gogcli`](https://gogcli.sh) (the `gog` binary) and, like `ms365`,
is installed **once per Google account** — each becomes its own MCP
(`google-<prefix>`, tools `mcp__google-<prefix>__…`) with its own credentials.

**One-time per account — create a Google OAuth client:** in
[Google Cloud Console](https://console.cloud.google.com) create (or pick) a
project, enable the APIs you want (Gmail, Calendar, Drive, …), then
**APIs & Services → Credentials → Create credentials → OAuth client ID →
Desktop app**, and download its `credentials.json`. You chose **a separate
client per account**, so do this once for each account.

Then install + log in each account:

```bash
./bootstrap.sh google                              # asks: 4-letter prefix + email + a keyring passphrase
./servers/google/login.sh work ~/Downloads/work-client.json   # stores the client, opens browser to authorize
./servers/google/login.sh prsl ~/Downloads/prsl-client.json
```

- **prefix** (≤4 letters) → names the MCP `google-<prefix>` and the OAuth client bucket.
- **email** → the account `gog` pins this server to (`--account`).
- **keyring passphrase** → encrypts that account's local token file (`GOG_KEYRING_BACKEND=file`,
  so Claude can launch the server without macOS Keychain prompts).

Each account's client + tokens live under `servers/google/.creds/<prefix>/`
(via `GOG_HOME`); the `gog` binary and `.creds/` are git-ignored. The MCP is
started with `--allow-write` (Gmail send, Drive/Docs edits, etc.) — drop that
flag in `config.json` for a read-only server.

### Adding a new MCP later

Drop a new `servers/<name>/` folder with `manifest.sh`, `setup.sh`, and
`config.json`. No edits to `bootstrap.sh` — it's picked up automatically.
A server that installs once-per-account (like `ms365`/`google`) adds a top-level
`__instance__` block to its `config.json` — see `install_config.py` for the format.

## Security

- **No secrets in the repo.** `.gitignore` blocks tokens, `.env`, session files,
  `*.db`, and the Claude config. Secrets are prompted at install time and written
  only into Claude's config.
- **`teamwork` builds from the official Teamwork GitHub** and verifies the clone's
  commit + the SDK module hash against a known-good reference before building —
  it won't build on a mismatch. Other servers are vendored from the exact source
  I run (third-party ones keep their upstream `LICENSE` + attribution).
- Go/npm builds run no untrusted lifecycle scripts beyond the projects' own.

#!/usr/bin/env python3
"""
Authenticate ONE google instance:
  1) store its OAuth client credentials (a separate client per account), then
  2) browser-login the account.

Reads the instance's env from Claude's config (GOG_HOME, file-keyring password)
so the client + tokens land in servers/google/.creds/<prefix>/ — fully separate
from every other account.

Usage: login.py <prefix> [path-to-credentials.json]
"""
import json
import os
import subprocess
import sys


def config_path():
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~/AppData/Roaming")
        return os.path.join(base, "Claude", "claude_desktop_config.json")
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/Claude/claude_desktop_config.json")
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return os.path.join(base, "Claude", "claude_desktop_config.json")


def flag(args, name):
    """Value following `name` in an args list, or None."""
    if name in args:
        i = args.index(name)
        if i + 1 < len(args):
            return args[i + 1]
    return None


def main():
    if not (2 <= len(sys.argv) <= 3):
        sys.stderr.write("usage: login.py <prefix> [path-to-credentials.json]\n")
        return 1
    prefix = sys.argv[1].strip().lower()
    credfile = sys.argv[2] if len(sys.argv) == 3 else None
    key = f"google-{prefix}"

    cfg_path = config_path()
    if not os.path.exists(cfg_path):
        sys.stderr.write(f"Claude config not found at {cfg_path} — run bootstrap first.\n")
        return 1
    entry = (json.load(open(cfg_path)).get("mcpServers") or {}).get(key)
    if not entry:
        avail = [k for k in (json.load(open(cfg_path)).get("mcpServers") or {}) if k.startswith("google-")]
        sys.stderr.write(f"no MCP server '{key}' in config. Installed google instances: {avail or 'none'}\n")
        return 1

    gog = entry["command"]
    args = entry.get("args", [])
    client = flag(args, "--client") or prefix
    email = flag(args, "--account")
    env = {**os.environ, **entry.get("env", {})}
    home = env.get("GOG_HOME", "?")

    # 1) ensure the OAuth client credentials are stored for this client
    listed = subprocess.run([gog, "--client", client, "auth", "credentials", "list", "--json"],
                            env=env, capture_output=True, text=True)
    try:
        clients = json.loads(listed.stdout or "{}").get("clients", [])
    except json.JSONDecodeError:
        clients = []
    have = any(client in json.dumps(c) for c in clients)
    if credfile or not have:
        if not credfile:
            credfile = input("  path to this account's credentials.json (Desktop OAuth client from Google Cloud): ").strip()
        credfile = os.path.expanduser(credfile or "")
        if not credfile or not os.path.isfile(credfile):
            sys.stderr.write("  credentials.json not found — download a Desktop OAuth client from Google Cloud Console first.\n")
            return 1
        subprocess.run([gog, "--client", client, "auth", "credentials", "set", credfile],
                       env=env, check=True)

    # 2) browser login for this account (replaces this process)
    print(f"→ authorizing {email}  (client '{client}', creds -> {home})")
    print("  a browser window will open; if it can't, re-run gog auth add with --manual.")
    os.execvpe(gog, [gog, "--client", client, "auth", "add", email], env)


if __name__ == "__main__":
    sys.exit(main())

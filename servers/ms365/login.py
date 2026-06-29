#!/usr/bin/env python3
"""
Run the device-code login for ONE ms365 instance, using that instance's exact
env from Claude's config (so the token lands in its own .creds/<prefix> dir via
the auth-cache wrapper — not the shared keychain).

Usage: login.py <prefix>     (the 4-letter prefix chosen at install time)
"""
import json
import os
import sys


def config_path():
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~/AppData/Roaming")
        return os.path.join(base, "Claude", "claude_desktop_config.json")
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/Claude/claude_desktop_config.json")
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return os.path.join(base, "Claude", "claude_desktop_config.json")


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: login.py <prefix>\n")
        return 1
    prefix = sys.argv[1].strip().lower()
    key = f"ms365-{prefix}"

    cfg_path = config_path()
    if not os.path.exists(cfg_path):
        sys.stderr.write(f"Claude config not found at {cfg_path} — run bootstrap first.\n")
        return 1
    with open(cfg_path) as f:
        cfg = json.load(f)
    entry = (cfg.get("mcpServers") or {}).get(key)
    if not entry:
        avail = [k for k in (cfg.get("mcpServers") or {}) if k.startswith("ms365-")]
        sys.stderr.write(f"no MCP server '{key}' in config. Installed ms365 instances: {avail or 'none'}\n")
        return 1

    command = entry["command"]
    args = list(entry.get("args", [])) + ["--login"]
    env = dict(os.environ)
    env.update(entry.get("env", {}))

    print(f"→ logging in {key}  (tenant: {env.get('MS365_MCP_TENANT_ID', '?')})")
    print(f"  credentials -> {env.get('MS365_AUTH_CACHE_DIR', '?')}")
    os.execvpe(command, [command] + args, env)  # replaces this process


if __name__ == "__main__":
    sys.exit(main())

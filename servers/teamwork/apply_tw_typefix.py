#!/usr/bin/env python3
"""Idempotently rewrite the Cowork 'teamwork' MCP entry to route through the
tw_typefix_proxy. Run this ONLY while the Claude desktop app is fully quit.

- Backs up claude_desktop_config.json to a timestamped .bak first.
- Preserves the existing env (bearer token + API URL) untouched.
- Points command -> /usr/bin/python3, args -> [proxy], adds TW_MCP_BIN.
- Never prints any secret value. Safe to re-run.
"""
import json, os, shutil, sys, datetime

HOME = os.path.expanduser("~")
CFG = f"{HOME}/Library/Application Support/Claude/claude_desktop_config.json"
PROXY = f"{HOME}/.claude-mcp-setup/tw_typefix_proxy.py"
PYBIN = "/usr/bin/python3"
KNOWN_BIN = "/Users/rjalabanzas/ClaudeOS/Code Repos/teamwork-mcp/tw-mcp"

def looks_like_python(cmd):
    return bool(cmd) and os.path.basename(cmd).startswith("python")

def main():
    if not os.path.exists(CFG):
        print("ERROR: config not found:", CFG); sys.exit(1)
    if not os.path.exists(PROXY):
        print("ERROR: proxy not found:", PROXY); sys.exit(1)

    with open(CFG) as f:
        data = json.load(f)
    servers = data.setdefault("mcpServers", {})
    tw = servers.get("teamwork")
    if not isinstance(tw, dict):
        print("ERROR: no 'teamwork' server entry to patch."); sys.exit(1)

    env = dict(tw.get("env") or {})
    # Resolve the real binary path (idempotent): prefer an already-set
    # TW_MCP_BIN; else the current command if it isn't python; else the known path.
    cur_cmd = tw.get("command")
    orig_bin = env.get("TW_MCP_BIN") \
        or (cur_cmd if (cur_cmd and not looks_like_python(cur_cmd)) else KNOWN_BIN)
    if not os.path.exists(orig_bin):
        print("ERROR: resolved tw-mcp binary does not exist:", orig_bin); sys.exit(1)

    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = f"{CFG}.bak-{ts}"
    shutil.copy2(CFG, bak)

    env["TW_MCP_BIN"] = orig_bin
    tw["command"] = PYBIN
    tw["args"] = [PROXY]
    tw["env"] = env

    with open(CFG, "w") as f:
        json.dump(data, f, indent=2)

    has_token = "TW_MCP_BEARER_TOKEN" in env and bool(env["TW_MCP_BEARER_TOKEN"])
    has_url = "TW_MCP_API_URL" in env and bool(env["TW_MCP_API_URL"])
    print("OK applied")
    print(f"  backup     -> {bak}")
    print(f"  command    -> {PYBIN}")
    print(f"  args       -> [{PROXY}]")
    print(f"  TW_MCP_BIN -> {orig_bin}")
    print(f"  env: bearer_token_present={has_token} api_url_present={has_url}")

if __name__ == "__main__":
    main()

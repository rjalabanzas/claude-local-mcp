#!/usr/bin/env python3
"""
Merge selected MCP server entries into Claude/Cowork's claude_desktop_config.json.

Called by bootstrap.sh after each selected server has been built/vendored. Reads
each servers/<name>/config.json template, expands placeholders, prompts for any
secrets (hidden input), backs up the config, and writes the merged result.

RUN ONLY WHILE CLAUDE/COWORK IS FULLY QUIT (it rewrites the file on Cmd+Q).

Placeholders supported in a server's config.json:
  ${REPO}          -> absolute path of this bootstrap repo
  ${HOME}          -> user home dir
  ${BIN:name}      -> absolute path to `name` (uv/node/python3/...), resolved via PATH
  ${SECRET:KEY}    -> prompted once via hidden input; reuses existing value if the
                      server entry already has env[KEY] in the current config
Secrets are NEVER read from or written to this repo — only into the config file.

Usage: install_config.py <repo_root> <server1> [server2 ...]
"""
import json, os, sys, time, shutil, getpass, shutil as _sh

CFG = os.path.expanduser('~/Library/Application Support/Claude/claude_desktop_config.json')


def fail(msg):
    print(f"\033[1;31m✗ {msg}\033[0m", file=sys.stderr); sys.exit(1)


def resolve_bin(name):
    p = _sh.which(name)
    if p:
        return p
    for cand in (f"{os.path.expanduser('~')}/.local/bin/{name}",
                 f"/usr/local/go/bin/{name}", "/opt/homebrew/bin/" + name,
                 f"/usr/local/bin/{name}", f"/usr/bin/{name}"):
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    fail(f"could not resolve required binary: {name}")


def expand(obj, repo, existing_env, secret_cache):
    """Recursively expand ${...} placeholders in strings."""
    if isinstance(obj, dict):
        return {k: expand(v, repo, existing_env, secret_cache) for k, v in obj.items()}
    if isinstance(obj, list):
        return [expand(v, repo, existing_env, secret_cache) for v in obj]
    if not isinstance(obj, str):
        return obj
    s = obj
    s = s.replace("${REPO}", repo).replace("${HOME}", os.path.expanduser("~"))
    # ${BIN:name}
    while "${BIN:" in s:
        i = s.index("${BIN:"); j = s.index("}", i)
        name = s[i + 6:j]
        s = s[:i] + resolve_bin(name) + s[j + 1:]
    # ${SECRET:KEY}
    while "${SECRET:" in s:
        i = s.index("${SECRET:"); j = s.index("}", i)
        key = s[i + 9:j]
        if key not in secret_cache:
            val = existing_env.get(key, "")
            if val:
                print(f"  reusing existing {key} from current config")
            else:
                val = getpass.getpass(f"  paste value for {key} (hidden input): ").strip()
                if not val:
                    fail(f"no value entered for {key} — aborted, nothing changed")
            secret_cache[key] = val
        s = s[:i] + secret_cache[key] + s[j + 1:]
    # ${ASK:KEY} — non-secret required value (e.g. tenant id, client id, site URL);
    # visible prompt, reuses the existing config value if present.
    while "${ASK:" in s:
        i = s.index("${ASK:"); j = s.index("}", i)
        key = s[i + 6:j]
        if key not in secret_cache:
            val = existing_env.get(key, "")
            if val:
                print(f"  reusing existing {key} from current config")
            else:
                val = input(f"  enter value for {key}: ").strip()
                if not val:
                    fail(f"no value entered for {key} — aborted, nothing changed")
            secret_cache[key] = val
        s = s[:i] + secret_cache[key] + s[j + 1:]
    return s


def main():
    if len(sys.argv) < 3:
        fail("usage: install_config.py <repo_root> <server> [server ...]")
    repo = os.path.abspath(sys.argv[1])
    servers = sys.argv[2:]

    if 'Claude.app' in os.popen("pgrep -fl 'Claude.app' 2>/dev/null").read():
        fail("Claude/Cowork is running. Fully quit it (Cmd+Q), then re-run.")

    os.makedirs(os.path.dirname(CFG), exist_ok=True)
    cfg = {}
    if os.path.exists(CFG):
        with open(CFG) as f:
            cfg = json.load(f)
    mcp = cfg.setdefault("mcpServers", {})

    secret_cache = {}
    changed = []
    for name in servers:
        tmpl_path = os.path.join(repo, "servers", name, "config.json")
        if not os.path.isfile(tmpl_path):
            fail(f"no config.json for server '{name}' at {tmpl_path}")
        with open(tmpl_path) as f:
            tmpl = json.load(f)
        existing_env = (mcp.get(name) or {}).get("env", {}) if isinstance(mcp.get(name), dict) else {}
        mcp[name] = expand(tmpl, repo, existing_env, secret_cache)
        changed.append(name)

    bak = CFG + ".bak-" + time.strftime("%Y%m%d-%H%M%S")
    if os.path.exists(CFG):
        shutil.copy2(CFG, bak)
    with open(CFG, "w") as f:
        json.dump(cfg, f, indent=2)

    print(f"\033[1;32m✓ wrote {len(changed)} server(s): {', '.join(changed)}\033[0m")
    if os.path.exists(bak):
        print(f"  backup: {os.path.basename(bak)}")
    print(f"  servers now in config: {', '.join(sorted(mcp.keys()))}")
    print("  Launch Cowork to load the changes.")


if __name__ == "__main__":
    main()

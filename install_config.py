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
  ${OSEXE:base}    -> `base` on macOS/Linux, `base.cmd` on Windows (for a wrapper
                      executable Node must spawn directly, shell:false)
  ${SECRET:KEY}    -> prompted once via hidden input; reuses existing value if the
                      server entry already has env[KEY] in the current config
  ${ASK:KEY}       -> visible prompt for a non-secret required value; reuses existing
  ${VAR}           -> an instance variable (see below), e.g. ${PREFIX}, ${TENANT}
Secrets are NEVER read from or written to this repo — only into the config file.

Multi-instance servers (e.g. ms365 — one entry per account):
  A config.json may carry a top-level "__instance__" object:
      "__instance__": {
        "key": "ms365-${PREFIX}",                  # the config key this writes to
        "prompts": [ {"var": "PREFIX", "label": "...", "validate": "prefix"},
                     {"var": "TENANT", "label": "...", "default": "common"} ]
      }
  A prompt with "default" uses that value when the user enters nothing (otherwise
  a blank answer aborts). Each prompt is exposed as a ${VAR} placeholder; the
  resolved "key" is where the entry is written, so installing the same server
  again with a different prefix ADDS another instance instead of overwriting.

Usage: install_config.py <repo_root> <server1> [server2 ...]
"""
import json, os, re, sys, time, shutil, getpass, subprocess, shutil as _sh


def _config_path():
    """Claude/Cowork config location, per OS."""
    if sys.platform == 'win32':
        base = os.environ.get('APPDATA') or os.path.expanduser('~/AppData/Roaming')
        return os.path.join(base, 'Claude', 'claude_desktop_config.json')
    if sys.platform == 'darwin':
        return os.path.expanduser('~/Library/Application Support/Claude/claude_desktop_config.json')
    base = os.environ.get('XDG_CONFIG_HOME') or os.path.expanduser('~/.config')
    return os.path.join(base, 'Claude', 'claude_desktop_config.json')


CFG = _config_path()


def claude_is_running():
    """True if Claude/Cowork is running (it rewrites the config on quit)."""
    try:
        if sys.platform == 'win32':
            out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq Claude.exe'],
                                 capture_output=True, text=True).stdout
            return 'Claude.exe' in out
        out = subprocess.run(['pgrep', '-fl', 'Claude.app'],
                             capture_output=True, text=True).stdout
        return 'Claude.app' in out
    except Exception:
        return False


def fail(msg):
    print(f"\033[1;31m✗ {msg}\033[0m", file=sys.stderr); sys.exit(1)


def resolve_bin(name):
    p = _sh.which(name)
    if p:
        return p
    # python is `python3` on mac/linux but usually `python` on Windows; try both.
    alt = {'python3': 'python', 'python': 'python3'}.get(name)
    if alt:
        p = _sh.which(alt)
        if p:
            return p
    for cand in (f"{os.path.expanduser('~')}/.local/bin/{name}",
                 f"/usr/local/go/bin/{name}", "/opt/homebrew/bin/" + name,
                 f"/usr/local/bin/{name}", f"/usr/bin/{name}"):
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    fail(f"could not resolve required binary: {name}")


def expand(obj, repo, existing_env, secret_cache, vars=None):
    """Recursively expand ${...} placeholders in strings."""
    vars = vars or {}
    if isinstance(obj, dict):
        return {k: expand(v, repo, existing_env, secret_cache, vars) for k, v in obj.items()}
    if isinstance(obj, list):
        return [expand(v, repo, existing_env, secret_cache, vars) for v in obj]
    if not isinstance(obj, str):
        return obj
    s = obj
    s = s.replace("${REPO}", repo).replace("${HOME}", os.path.expanduser("~"))
    # instance vars: ${PREFIX}, ${DOMAIN}, ... (done before BIN/OSEXE so paths resolve)
    for k, v in vars.items():
        s = s.replace("${" + k + "}", v)
    # ${BIN:name}
    while "${BIN:" in s:
        i = s.index("${BIN:"); j = s.index("}", i)
        name = s[i + 6:j]
        s = s[:i] + resolve_bin(name) + s[j + 1:]
    # ${OSEXE:base} -> base (POSIX) / base.cmd (Windows)
    while "${OSEXE:" in s:
        i = s.index("${OSEXE:"); j = s.index("}", i)
        base = s[i + 8:j]
        s = s[:i] + (base + ".cmd" if sys.platform == "win32" else base) + s[j + 1:]
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


def prompt_instance(inst, mcp):
    """Ask the instance prompts; return (config_key, vars). Asked before any write."""
    vars = {}
    for p in inst.get("prompts", []):
        var, label, validate = p["var"], p["label"], p.get("validate")
        default = p.get("default")
        while True:
            val = input(f"  {label}: ").strip()
            if not val:
                if default is not None:
                    val = default
                else:
                    fail(f"no value entered for {var} — aborted, nothing changed")
            if validate == "prefix":
                val = val.lower()
                if not re.fullmatch(r"[a-z]{1,4}", val):
                    print("    → must be 1–4 letters (a–z only, no spaces or digits)"); continue
            vars[var] = val
            break
    key = inst["key"]
    for k, v in vars.items():
        key = key.replace("${" + k + "}", v)
    if key in mcp:
        print(f"  note: '{key}' already exists — it will be updated.")
    return key, vars


def main():
    if len(sys.argv) < 3:
        fail("usage: install_config.py <repo_root> <server> [server ...]")
    repo = os.path.abspath(sys.argv[1])
    servers = sys.argv[2:]

    if claude_is_running():
        fail("Claude/Cowork is running. Fully quit it, then re-run.")

    os.makedirs(os.path.dirname(CFG), exist_ok=True)
    cfg = {}
    if os.path.exists(CFG):
        with open(CFG) as f:
            cfg = json.load(f)
    mcp = cfg.setdefault("mcpServers", {})

    secret_cache = {}
    changed = []
    instances = []  # (server_name, config_key, vars) for post-install hints
    for name in servers:
        tmpl_path = os.path.join(repo, "servers", name, "config.json")
        if not os.path.isfile(tmpl_path):
            fail(f"no config.json for server '{name}' at {tmpl_path}")
        with open(tmpl_path) as f:
            tmpl = json.load(f)
        inst = tmpl.pop("__instance__", None)
        if inst:
            print(f"\n  {name}: configuring a new instance")
            key, vars = prompt_instance(inst, mcp)
            existing_env = (mcp.get(key) or {}).get("env", {}) if isinstance(mcp.get(key), dict) else {}
            mcp[key] = expand(tmpl, repo, existing_env, secret_cache, vars)
            changed.append(key)
            instances.append((name, key, vars))
        else:
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
    for name, key, vars in instances:
        if name == "ms365":
            print(f"  {key}: authenticate with  ./servers/ms365/login.sh {vars['PREFIX']}")
    print("  Launch Cowork to load the changes.")


if __name__ == "__main__":
    main()

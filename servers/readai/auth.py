# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx>=0.27"]
# ///
"""One-time OAuth setup for the Read.ai local MCP server.

Run:  uv run auth.py

Read.ai uses OAuth 2.1 with dynamic client registration. This script registers
a client, walks you through the browser sign-in/consent, exchanges the
authorization code for tokens, and stores the refresh token locally.

All secrets are written only to ~/.config/readai-mcp/tokens.json (chmod 600).
The client_id/client_secret are printed once to THIS terminal because you must
paste them into Read.ai's OAuth web form — they never leave your machine.
"""
import json
import os
import re
import sys

import httpx

REGISTER_URL = "https://api.read.ai/oauth/register"
OAUTH_UI = "https://api.read.ai/oauth/ui"
TOKEN_URL = "https://authn.read.ai/oauth2/token"
TOKENS_PATH = os.path.expanduser("~/.config/readai-mcp/tokens.json")
REDIRECT_URI = "https://api.read.ai/oauth/ui"
SCOPE = "openid email offline_access profile meeting:read mcp:execute"


def load():
    try:
        with open(TOKENS_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save(data):
    os.makedirs(os.path.dirname(TOKENS_PATH), exist_ok=True)
    tmp = TOKENS_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.chmod(tmp, 0o600)
    os.replace(tmp, TOKENS_PATH)


def register():
    body = {
        "client_name": "RJ local MCP",
        "redirect_uris": [REDIRECT_URI],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "scope": SCOPE,
        "token_endpoint_auth_method": "client_secret_basic",
    }
    r = httpx.post(REGISTER_URL, json=body, timeout=30.0)
    r.raise_for_status()
    j = r.json()
    return j["client_id"], j["client_secret"]


def main():
    data = load()
    if data.get("client_id") and data.get("client_secret"):
        print("Using existing client registration.")
    else:
        print("Registering a new OAuth client with Read.ai ...")
        cid, csec = register()
        data["client_id"], data["client_secret"] = cid, csec
        save(data)
        print("Registered and saved.")

    print("\n=== STEP 1: authorize in your browser ===")
    print(f"1. Open: {OAUTH_UI}")
    print("2. Enter these when prompted (your client credentials):")
    print(f"     client_id:     {data['client_id']}")
    print(f"     client_secret: {data['client_secret']}")
    print(f"   (redirect URI should prefill as {REDIRECT_URI})")
    print("3. Click 'Start OAuth Flow', sign in to Read.ai, then 'Allow Access'.")
    print("4. On the Authorization Code screen, click 'Copy Command'.\n")

    print("=== STEP 2: paste the copied command below, then press Enter on a blank line ===")
    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "" and lines:
            break
        lines.append(line)
    blob = "\n".join(lines)

    def grab(name):
        m = re.search(rf'{name}=([^"&\s\\]+)', blob)
        return m.group(1) if m else None

    code = grab("code")
    verifier = grab("code_verifier")
    redirect = grab("redirect_uri") or REDIRECT_URI
    if not code or not verifier:
        print("\nCouldn't find code / code_verifier in what you pasted.")
        print("Re-run and paste the full 'Copy Command' from the OAuth page.")
        sys.exit(1)

    print("\nExchanging authorization code for tokens ...")
    r = httpx.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect,
            "code_verifier": verifier,
        },
        auth=(data["client_id"], data["client_secret"]),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30.0,
    )
    if r.status_code != 200:
        print(f"Token exchange failed ({r.status_code}): {r.text[:400]}")
        print("Authorization codes are single-use and short-lived — redo STEP 1 to get a fresh one.")
        sys.exit(1)
    tok = r.json()
    if not tok.get("refresh_token"):
        print("No refresh_token returned — make sure 'offline_access' scope was granted on the consent screen.")
        sys.exit(1)

    data["refresh_token"] = tok["refresh_token"]
    save(data)
    print(f"\nDone. Refresh token stored in {TOKENS_PATH} (chmod 600).")
    print("Next: quit Cowork, run add_readai_server.py, relaunch.")


if __name__ == "__main__":
    main()

# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp>=1.2.0", "httpx>=0.27"]
# ///
"""Local MCP server wrapping the Read.ai REST API (read-only).

Auth/credentials live in ~/.config/readai-mcp/tokens.json (created by auth.py).
Read.ai uses OAuth 2.1 with 10-minute access tokens and single-use rotating
refresh tokens; TokenManager refreshes on demand and persists the rotated
refresh token atomically after every refresh.
"""
import json
import os
import threading
import time

import httpx
from mcp.server.fastmcp import FastMCP

API_BASE = "https://api.read.ai"
TOKEN_URL = "https://authn.read.ai/oauth2/token"
TOKENS_PATH = os.path.expanduser("~/.config/readai-mcp/tokens.json")

ALLOWED_EXPAND = {
    "summary", "chapter_summaries", "action_items", "key_questions",
    "topics", "transcript", "metrics", "recording_download",
}

mcp = FastMCP("readai")


class TokenError(RuntimeError):
    pass


class TokenManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._access = None
        self._exp = 0.0
        self._data = None

    def _load(self):
        if self._data is not None:
            return
        try:
            with open(TOKENS_PATH) as f:
                self._data = json.load(f)
        except FileNotFoundError:
            raise TokenError(
                f"No credentials at {TOKENS_PATH}. Run auth.py once to authorize."
            )
        for k in ("client_id", "client_secret", "refresh_token"):
            if not self._data.get(k):
                raise TokenError(f"Missing '{k}' in {TOKENS_PATH}. Re-run auth.py.")

    def _save(self):
        os.makedirs(os.path.dirname(TOKENS_PATH), exist_ok=True)
        tmp = TOKENS_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self._data, f, indent=2)
        os.chmod(tmp, 0o600)
        os.replace(tmp, TOKENS_PATH)  # atomic

    def _refresh(self):
        r = httpx.post(
            TOKEN_URL,
            data={"grant_type": "refresh_token",
                  "refresh_token": self._data["refresh_token"]},
            auth=(self._data["client_id"], self._data["client_secret"]),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30.0,
        )
        if r.status_code != 200:
            raise TokenError(
                f"Token refresh failed ({r.status_code}) — you may need to re-run "
                f"auth.py. Body: {r.text[:300]}"
            )
        tok = r.json()
        self._access = tok["access_token"]
        self._exp = time.time() + float(tok.get("expires_in", 599)) - 60
        # Refresh tokens rotate on every use — persist the new one immediately.
        if tok.get("refresh_token"):
            self._data["refresh_token"] = tok["refresh_token"]
            self._save()

    def token(self, force=False):
        with self._lock:
            self._load()
            if force or not self._access or time.time() >= self._exp:
                self._refresh()
            return self._access

    def invalidate(self):
        with self._lock:
            self._access = None
            self._exp = 0.0


TM = TokenManager()


def _get(path, params=None):
    last = None
    for attempt in range(2):
        tok = TM.token(force=(attempt == 1))
        r = httpx.get(
            API_BASE + path,
            params=params,
            headers={"Authorization": f"Bearer {tok}", "Accept": "application/json"},
            timeout=60.0,
        )
        if r.status_code == 401 and attempt == 0:
            TM.invalidate()
            last = r
            continue
        if r.status_code != 200:
            raise RuntimeError(f"Read.ai API {r.status_code} on {path}: {r.text[:300]}")
        return r.json()
    raise RuntimeError(
        f"Read.ai API auth failed on {path}: {last.text[:300] if last else 'unknown'}"
    )


def _check_expand(expand):
    if not expand:
        return []
    bad = [e for e in expand if e not in ALLOWED_EXPAND]
    if bad:
        raise ValueError(
            f"Invalid expand fields {bad}. Allowed: {sorted(ALLOWED_EXPAND)}"
        )
    return expand


@mcp.tool()
def list_meetings(
    limit: int = 10,
    start_time_ms_gte: int | None = None,
    start_time_ms_lte: int | None = None,
    expand: list[str] | None = None,
    cursor: str | None = None,
    max_results: int = 10,
) -> dict:
    """List Read.ai meetings, newest first.

    The API caps each page at 10; `max_results` pages via cursor up to that total.
    `expand` options: summary, chapter_summaries, action_items, key_questions,
    topics, transcript, metrics, recording_download. Expandable fields are only
    populated for ENDED meetings; active meetings return little or none.
    """
    expand = _check_expand(expand)
    limit = max(1, min(int(limit), 10))
    collected = []
    next_cursor = cursor
    has_more = False
    while len(collected) < max_results:
        params = [("limit", min(limit, max_results - len(collected)))]
        if start_time_ms_gte is not None:
            params.append(("start_time_ms.gte", start_time_ms_gte))
        if start_time_ms_lte is not None:
            params.append(("start_time_ms.lte", start_time_ms_lte))
        for e in expand:
            params.append(("expand[]", e))
        if next_cursor:
            params.append(("cursor", next_cursor))
        page = _get("/v1/meetings", params)
        data = page.get("data", [])
        collected.extend(data)
        has_more = bool(page.get("has_more", False))
        if not data or not has_more:
            break
        next_cursor = data[-1].get("id")
        if not next_cursor:
            break
    return {
        "count": len(collected),
        "has_more": has_more,
        "next_cursor": (collected[-1]["id"] if (has_more and collected) else None),
        "meetings": collected[:max_results],
    }


@mcp.tool()
def get_meeting(meeting_id: str, expand: list[str] | None = None) -> dict:
    """Retrieve one ended meeting by ULID.

    Use `expand` to include transcript, summary, action_items, key_questions,
    topics, metrics, chapter_summaries, recording_download.
    """
    expand = _check_expand(expand)
    params = [("expand[]", e) for e in expand]
    return _get(f"/v1/meetings/{meeting_id}", params or None)


@mcp.tool()
def get_live_meeting(
    meeting_id: str,
    expand: list[str] | None = None,
    start_time_ms_gte: int | None = None,
) -> dict:
    """Retrieve real-time data for an ACTIVE meeting by ULID.

    Only `transcript` and `chapter_summaries` are available, and only if the
    live dashboard was open during the meeting.
    """
    expand = [e for e in (expand or []) if e in {"transcript", "chapter_summaries"}]
    params = [("expand[]", e) for e in expand]
    if start_time_ms_gte is not None:
        params.append(("start_time_ms.gte", start_time_ms_gte))
    return _get(f"/v1/meetings/{meeting_id}/live", params or None)


if __name__ == "__main__":
    mcp.run()

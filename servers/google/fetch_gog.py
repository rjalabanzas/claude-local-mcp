#!/usr/bin/env python3
"""
Download the prebuilt `gog` (gogcli) binary for this OS/arch into <bindir>.

Self-contained installer (urllib only) so `bootstrap.sh google` works on macOS,
Linux, and Windows (Git Bash) without Homebrew or Go. Verifies the SHA-256 from
the release's checksums.txt before extracting.

Usage: fetch_gog.py <bindir>
Env:   GOG_VERSION=0.31.1   pin a version (default: latest release)
"""
import hashlib
import io
import os
import platform
import subprocess
import sys
import tarfile
import zipfile

REPO = "openclaw/gogcli"


def fail(msg):
    sys.stderr.write(f"\033[1;31m✗ {msg}\033[0m\n")
    sys.exit(1)


def get(url):
    # curl uses the system trust store — avoids the missing-CA issues that the
    # python.org Python build hits with urllib on macOS, and works in Git Bash.
    try:
        return subprocess.run(
            ["curl", "-fsSL", "-A", "claude-local-mcp-installer", url],
            capture_output=True, check=True,
        ).stdout
    except subprocess.CalledProcessError as e:
        fail(f"download failed ({url}): curl exit {e.returncode} {e.stderr.decode()[:200]}")


def platform_tag():
    osname = {"darwin": "darwin", "win32": "windows"}.get(sys.platform, "linux")
    m = platform.machine().lower()
    if m in ("x86_64", "amd64", "x64"):
        arch = "amd64"
    elif m in ("arm64", "aarch64"):
        arch = "arm64"
    else:
        fail(f"unsupported CPU architecture: {platform.machine()}")
    ext = "zip" if osname == "windows" else "tar.gz"
    return osname, arch, ext


def latest_version():
    import json
    data = json.loads(get(f"https://api.github.com/repos/{REPO}/releases/latest"))
    return data["tag_name"].lstrip("v")


def main():
    if len(sys.argv) != 2:
        fail("usage: fetch_gog.py <bindir>")
    bindir = os.path.abspath(sys.argv[1])
    os.makedirs(bindir, exist_ok=True)
    osname, arch, ext = platform_tag()
    binname = "gog.exe" if osname == "windows" else "gog"
    target = os.path.join(bindir, binname)

    ver = (os.environ.get("GOG_VERSION") or "").strip() or latest_version()
    asset = f"gogcli_{ver}_{osname}_{arch}.{ext}"
    base = f"https://github.com/{REPO}/releases/download/v{ver}"

    print(f"  downloading {asset} …")
    blob = get(f"{base}/{asset}")

    # verify sha256 against the release checksums.txt
    try:
        sums = get(f"{base}/checksums.txt").decode()
        want = next((ln.split()[0] for ln in sums.splitlines()
                     if ln.strip().endswith(asset)), None)
        if want:
            got = hashlib.sha256(blob).hexdigest()
            if got != want:
                fail(f"checksum mismatch for {asset}\n  expected {want}\n  got      {got}")
            print("  ✓ sha256 verified")
        else:
            print("  ! asset not listed in checksums.txt — skipping verify")
    except Exception as e:
        print(f"  ! could not verify checksum ({e}) — continuing")

    # extract just the gog binary
    data = None
    if ext == "zip":
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            member = next((n for n in z.namelist() if os.path.basename(n) == binname), None)
            if not member:
                fail(f"{binname} not found inside {asset}")
            data = z.read(member)
    else:
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as t:
            member = next((m for m in t.getmembers()
                           if os.path.basename(m.name) == binname), None)
            if not member:
                fail(f"{binname} not found inside {asset}")
            data = t.extractfile(member).read()

    with open(target, "wb") as f:
        f.write(data)
    os.chmod(target, 0o755)
    print(f"  ✓ installed gog {ver} -> {target}")


if __name__ == "__main__":
    main()

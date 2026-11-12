#!/usr/bin/env python3
# ruff: noqa: E501  (long user-facing messages)
"""Check a Simli setup without starting a session.

Reads SIMLI_API_KEY and SIMLI_FACE_ID from the environment, or from a .env file in the
current directory (or --env PATH). Makes only read-only API calls, so no streaming minutes
are used, and never prints the API key.

  python3 check_setup.py                      # check key, face and active sessions
  python3 check_setup.py --face <face id>     # check a specific face
  python3 check_setup.py --audio speech.pcm   # also sanity-check a PCM16 16 kHz mono file

Standard library only. Exit code 0 when everything checked is fine, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.simli.ai"
DEFAULT_FACE = "bf13113a-355a-4d97-8b90-4edccd1da7b2"  # preset "Anna" (Trinity-2)


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def get(path: str, key: str) -> tuple[int, object]:
    req = urllib.request.Request(
        API + path, headers={"x-simli-api-key": key, "User-Agent": "simli-skill-check/1"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read().decode() or "null"
            return r.status, json.loads(body)
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text
    except urllib.error.URLError as e:
        return 0, str(e.reason)


def check_audio(path: Path) -> bool:
    data = path.read_bytes()
    ok = True
    print(f"\nAudio file {path} ({len(data):,} bytes)")
    if data[:4] == b"RIFF":
        print("  ✗ This is a WAV file (RIFF header). Simli needs raw PCM with no header:")
        print(
            f"    ffmpeg -i {path} -f s16le -acodec pcm_s16le -ar 16000 -ac 1 {path.with_suffix('.pcm')}"
        )
        return False
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3"):
        print("  ✗ This looks like MP3. Convert it to raw PCM16 16 kHz mono with ffmpeg.")
        return False
    if len(data) % 2:
        print("  ✗ Odd number of bytes: not 16-bit PCM, or truncated.")
        ok = False
    n = len(data) // 2
    if n == 0:
        print("  ✗ Empty.")
        return False
    samples = struct.unpack(f"<{n}h", data[: n * 2])
    peak = max(abs(s) for s in samples)
    clipped = sum(1 for s in samples if abs(s) >= 32767) / n
    print(f"  duration if 16 kHz mono: {n / 16000:.2f} s")
    if peak < 300:
        print(f"  ✗ Nearly silent (peak {peak} of 32767): wrong format, or no speech.")
        ok = False
    elif clipped > 0.01:
        print(
            f"  ! {clipped:.1%} of samples are clipped: possibly Float32 or big-endian data, or too loud."
        )
    else:
        print(f"  ✓ Plausible PCM16 speech (peak {peak}).")
    print("  Listen to check the rate: ffplay -f s16le -ar 16000 -ch_layout mono", path)
    return ok


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--env",
        default=".env",
        help="env file to read if the variables aren't set (default ./.env)",
    )
    p.add_argument(
        "--face", help="face ID to check (default: $SIMLI_FACE_ID, else the Anna preset)"
    )
    p.add_argument("--audio", type=Path, help="a PCM16 16 kHz mono file to sanity-check")
    args = p.parse_args()

    load_env_file(Path(args.env))
    key = os.environ.get("SIMLI_API_KEY", "").strip()
    public_name = None
    if not key:
        # Older Simli starters used browser-exposed names. Accept them, but flag them.
        for name in (
            "NEXT_PUBLIC_SIMLI_API_KEY",
            "VITE_SIMLI_API_KEY",
            "REACT_APP_SIMLI_API_KEY",
            "EXPO_PUBLIC_SIMLI_API_KEY",
        ):
            if os.environ.get(name, "").strip():
                key, public_name = os.environ[name].strip(), name
                break
    face = (
        args.face
        or os.environ.get("SIMLI_FACE_ID", "").strip()
        or os.environ.get("NEXT_PUBLIC_SIMLI_FACE_ID", "").strip()
        or DEFAULT_FACE
    )
    ok = True

    if public_name:
        print(
            f"! The key is in {public_name}. That prefix ships it to every browser that loads the app."
        )
        print(
            "  Rename it to SIMLI_API_KEY, use it only in a server route that creates session tokens,"
        )
        print("  and rotate the key if this app was ever deployed publicly.")
        ok = False

    if not key:
        print("✗ SIMLI_API_KEY is not set. Get a key at https://app.simli.com and put it in .env:")
        print("    SIMLI_API_KEY=...")
        ok = False
    else:
        print(f"SIMLI_API_KEY found ({len(key)} characters; not shown).")
        key_ok = False
        status, body = get("/ratelimiter/sessions", key)
        if status == 200 and isinstance(body, dict):
            print(f"✓ API key works. Sessions running right now: {body.get('currentUsage', '?')}")
            key_ok = True
        elif status == 401:
            print(
                "✗ API key rejected (401). Check for typos, quotes or whitespace, or create a new key."
            )
            ok = False
        elif status == 0:
            print(f"✗ Couldn't reach {API}: {body}")
            ok = False
        else:
            print(f"? Unexpected answer checking the key: {status} {body}")
            key_ok = True  # can't tell; still try the face

        if key_ok:
            status, body = get(f"/face/{face}", key)
            label = "preset Anna" if face == DEFAULT_FACE else "face"
            if status == 200 and isinstance(body, dict):
                version = body.get("simli_version")
                gen = {3: "Trinity-2"}.get(
                    version, "an older generation: no 16:9, camera or backgrounds"
                )
                print(
                    f"✓ Face {face} ({body.get('name') or label}) can be used. Model version {version} ({gen})."
                )
            elif status == 404:
                print(
                    f"✗ Face {face} wasn't found. If it's an older (pre-Trinity) face it may still work,"
                )
                print(
                    "  but it can't be checked here; prefer a Trinity-2 preset or a face from the dashboard."
                )
                ok = False
            elif status == 403:
                print(f"✗ Face {face} belongs to another account and isn't public.")
                ok = False
            elif status == 400:
                print(f"✗ '{face}' isn't a valid face ID (expected a UUID).")
                ok = False
            else:
                print(f"? Unexpected answer checking the face: {status} {body}")

    if args.audio:
        ok = check_audio(args.audio) and ok

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

# Simli from Python: `simli-ai`

Use the Python SDK when the program that produces the agent's voice is Python but isn't a LiveKit Agents or Pipecat app, or to render avatar video to files or frames (batch jobs, offline rendering, custom media servers). The key stays in the Python process, so no session token step is needed.

Live docs: https://docs.simli.com/api-reference/python.md and https://docs.simli.com/api-reference/python/reference.md

```bash
pip install simli-ai            # Python 3.11+
pip install "simli-ai[local]"   # adds LocalRenderer (a window + speakers) for quick visual checks
```

## Minimal session: audio in, MP4 out

```python
import asyncio
import os

from simli import SimliClient, SimliConfig
from simli.renderers.renderers import FileRenderer


async def main():
    with open("speech.pcm", "rb") as f:  # PCM16, 16 kHz, mono, no header
        audio = f.read()

    async with SimliClient(
        api_key=os.environ["SIMLI_API_KEY"],
        config=SimliConfig(
            faceId=os.getenv("SIMLI_FACE_ID", "bf13113a-355a-4d97-8b90-4edccd1da7b2"),
            maxSessionLength=120,  # seconds
            maxIdleTime=30,  # seconds
        ),
    ) as connection:
        await connection.send(audio)
        await FileRenderer(connection).render()  # writes output.mp4


asyncio.run(main())
```

`async with` starts and stops the session. Without it: `await connection.start()` … `await connection.stop()` (put the stop in a `finally`).

Convert input audio first if needed: `ffmpeg -i in.wav -f s16le -acodec pcm_s16le -ar 16000 -ac 1 speech.pcm` (see [audio.md](audio.md)).

## Sending audio

```python
await connection.send(chunk)           # bytes of PCM16 16 kHz mono; queued after earlier audio
await connection.clearBuffer()         # user interrupted: drop audio not yet spoken
await connection.sendImmediate(chunk)  # drop the queue and play this now
```

`SimliConfig(handleSilence=True)` (default) keeps the avatar moving between bursts of audio. Use `False` only when streaming continuous audio that already contains its own silence; the video then freezes whenever you stop sending.

## Getting video and audio out

- `FileRenderer(connection)` → `output.mp4`
- `LocalRenderer(connection)` → window + speakers (needs the `local` extra and a display)
- `NDArrayRenderer(connection)` → NumPy arrays when the session ends
- Your own handling, as PyAV frames — run both loops as separate tasks:

```python
async def video():
    async for frame in connection.getVideoStreamIterator("rgb24"):
        ...  # av.VideoFrame, 25 fps

async def audio():
    async for frame in connection.getAudioStreamIterator(targetSampleRate=48000):
        ...  # av.AudioFrame

await asyncio.gather(video(), audio())
```

## Errors

All exported from `simli`, all subclasses of `SimliError`:

- `SimliAPIError` — an API request failed (`status_code`, `detail`): bad key (401), unknown face (400 `INVALID_FACE_ID`), no minutes left, unsupported framing (422).
- `SimliSessionError` — Simli refused the session (expired token, rate limit).
- `SimliConnectionError` — network failure. `start()` retries only these and HTTP 5xx, up to `retry_count` (default 3) attempts with backoff.

```python
from simli import SimliAPIError, SimliError

try:
    await connection.start()
except SimliAPIError as e:
    print("Simli refused:", e.status_code, e.detail)
except SimliError as e:
    print("Simli failed:", e)
```

After a session ends, `connection.stopReason` gives Simli's reason (`"IDLE"`, `"MAX"`, …) and `connection.error` the error that ended it, if any. `send()` raises once the session has ended.

## Trinity-2 options

Set `streaming_width`, `streaming_height`, `avatar_position_x`, `avatar_position_y`, `camera=CameraSetting(...)`, `background_id`, `foreground_id` on `SimliConfig`. Live changes: `await connection.setCamera(CameraSetting(zoom=1.5), lerp_seconds=2)`, `await connection.setBackground(id)`, `await connection.setForeground(id)`, each with `None` to reset. See [trinity-2.md](trinity-2.md).

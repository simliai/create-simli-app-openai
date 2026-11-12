# Simli in Pipecat

`SimliVideoService` sits in a Pipecat pipeline right after the service that produces the bot's voice. It takes that audio and outputs the avatar's lip-synced video **and** audio frames, in sync, to the transport.

Live docs: https://docs.simli.com/api-reference/pipecat.md

## Requirements

- `SIMLI_API_KEY`, and a key for the voice/LLM provider (the starter only needs `OPENAI_API_KEY`).
- Python 3.11+.

```bash
pip install "pipecat-ai[openai,runner,simli,webrtc]" python-dotenv
# or: uv add "pipecat-ai[openai,runner,simli,webrtc]" python-dotenv
```

The starter pins `pipecat-ai==1.14.0`. Pipecat's API moves quickly: if the user's installed version differs, check the import paths below against their version before writing code.

## The integration

```python
import os

from pipecat.services.simli.video import SimliVideoService
from pipecat.transports.base_transport import TransportParams

WIDTH, HEIGHT = 768, 768  # Simli's default; see "Trinity-2 options" for 16:9

transport = SmallWebRTCTransport(  # or DailyTransport, FastAPIWebsocketTransport, ...
    webrtc_connection=runner_args.webrtc_connection,
    params=TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        video_out_enabled=True,
        video_out_is_live=True,
        video_out_width=WIDTH,
        video_out_height=HEIGHT,
        video_out_framerate=25,  # Simli streams at 25 fps
    ),
)

simli = SimliVideoService(
    api_key=os.environ["SIMLI_API_KEY"],
    face_id=os.getenv("SIMLI_FACE_ID") or "bf13113a-355a-4d97-8b90-4edccd1da7b2",
    max_session_length=600,  # seconds
    max_idle_time=120,  # seconds
)

pipeline = Pipeline(
    [
        transport.input(),
        user_aggregator,
        llm,  # e.g. OpenAIRealtimeLLMService, or stt -> llm -> tts
        simli,  # right after whatever produces the bot's voice (the LLM above, or the TTS service)
        transport.output(),
        assistant_aggregator,
    ]
)
```

If the user's `SimliVideoService` constructor rejects these keyword arguments, they are on an older Pipecat that took a `simli.SimliConfig` object instead. Check the installed signature (`python -c "import inspect; from pipecat.services.simli.video import SimliVideoService as S; print(inspect.signature(S.__init__))"`) and either match it or upgrade Pipecat.

Have the bot speak first, so the avatar appears straight away (this is also the workaround for the first known issue below):

```python
@transport.event_handler("on_client_connected")
async def on_client_connected(transport, client):
    await worker.queue_frames([LLMRunFrame()])  # from pipecat.frames.frames; use your task/worker object
```

Rules:

- `simli` goes **after** the TTS (or speech-to-speech LLM) and **before** `transport.output()`.
- The transport must have `video_out_enabled=True`, with the same width/height as the Simli stream, at 25 fps.
- Don't route the TTS audio to the output around Simli: Simli's output already contains the voice, in sync.

## Known issues (temporary)

- **No video until the bot first speaks** (pipecat#4832, fix in pipecat#5033). Have the bot greet the user as soon as the client connects (the `on_client_connected` handler above), so the avatar appears with the greeting.
- **GPT-Live audio frames are ignored** by `SimliVideoService`, so the avatar never moves. Use `OpenAIRealtimeLLMService` (or a separate TTS) instead, until the upstream fix ships.

Remove these workarounds once the user's Pipecat release includes the fixes.

## Trinity-2 options (16:9, position)

`SimliVideoService` has no Trinity-2 parameters yet. It wraps the Simli Python SDK, which sends every field of its config when the session starts, so add the fields there:

```python
WIDTH, HEIGHT = 1366, 768
simli = SimliVideoService(...)  # as above
simli._simli_client.config.__dict__.update(
    streaming_width=WIDTH,
    streaming_height=HEIGHT,
    avatar_position_x=0.5,  # 0 (left) .. 1 (right)
    avatar_position_y=1.0,  # 0 (top) .. 1 (bottom)
)
```

Then set `video_out_width=WIDTH, video_out_height=HEIGHT` on the transport. `_simli_client` is private and can change between Pipecat releases: check it exists in the installed version, and prefer real constructor parameters if the installed version has them.

## Run and test

With Pipecat's development runner, `python bot.py` serves a prebuilt browser client at http://localhost:7860: press **Connect** and allow the microphone.

The runner is for development only. Anyone who can reach its port can start a conversation and spend the user's Simli minutes and model credit, so keep it on localhost or behind sign-in, and use Pipecat's deployment guide for production.

## Errors

| Symptom | Cause |
|---|---|
| Error with `401` at startup | `SIMLI_API_KEY` wrong or inactive |
| `400` / invalid face | wrong `SIMLI_FACE_ID` |
| `422` | unsupported video size: must be 1:1, 16:9 or 9:16, each side >= 512 |
| `429` | the account is running its maximum number of concurrent sessions |
| Black video, voice works | the bot hasn't spoken yet (see Known issues), or `video_out_enabled` is off |
| Stretched or cropped video | transport size doesn't match the Simli stream size |

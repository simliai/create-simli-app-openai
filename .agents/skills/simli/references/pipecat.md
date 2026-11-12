# Simli in Pipecat

`SimliVideoService` sits in a Pipecat pipeline right after the service that produces the bot's voice. It takes that audio and outputs the avatar's lip-synced video **and** audio frames, in sync, to the transport.

Live docs: https://docs.simli.com/api-reference/pipecat.md. Starter: https://github.com/simliai/create-simli-app-pipecat

## Requirements

- `SIMLI_API_KEY`, and a key for the voice/LLM provider (the starter only needs `OPENAI_API_KEY`).
- Python 3.11+.
- **Pipecat 1.16 or later.** It added Trinity-2 framing, sends the avatar's video from the start of the session, and passes speech-to-speech audio (GPT-Live) to Simli. Check with `pip show pipecat-ai`. On 1.15 or earlier, upgrade, or see "Older Pipecat" below.

```bash
pip install "pipecat-ai[openai,runner,simli,webrtc]>=1.16" python-dotenv
# or: uv add "pipecat-ai[openai,runner,simli,webrtc]>=1.16" python-dotenv
```

## The integration

```python
import os

from pipecat.frames.frames import LLMRunFrame
from pipecat.services.simli.video import SimliVideoService
from pipecat.transports.base_transport import TransportParams

WIDTH, HEIGHT = 1366, 768  # 16:9; 1:1 (768x768, Simli's default) and 9:16 work too, each side >= 512

transport = SmallWebRTCTransport(  # or DailyTransport, FastAPIWebsocketTransport, ...
    webrtc_connection=runner_args.webrtc_connection,
    params=TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        video_out_enabled=True,
        video_out_is_live=True,
        video_out_width=WIDTH,  # must match the Simli stream size
        video_out_height=HEIGHT,
        video_out_framerate=25,  # Simli streams at 25 fps
    ),
)

simli = SimliVideoService(
    api_key=os.environ["SIMLI_API_KEY"],
    face_id=os.getenv("SIMLI_FACE_ID") or "bf13113a-355a-4d97-8b90-4edccd1da7b2",
    max_session_length=600,  # seconds
    max_idle_time=120,  # seconds
    framing=SimliVideoService.Framing(
        streaming_width=WIDTH,
        streaming_height=HEIGHT,
        avatar_position_x=0.5,  # 0 (left) .. 1 (right)
        avatar_position_y=1.0,  # 0 (top) .. 1 (bottom)
        # camera=SimliVideoService.Camera(zoom=1.2),
        # background_id="<id from POST /assets/backgrounds>",
    ),
)

pipeline = Pipeline(
    [
        transport.input(),
        user_aggregator,
        llm,  # e.g. OpenAIRealtimeLLMService / OpenAILiveLLMService, or stt -> llm -> tts
        simli,  # right after whatever produces the bot's voice (the LLM above, or the TTS service)
        transport.output(),
        assistant_aggregator,
    ]
)

# Have the bot speak first, so the avatar comes alive straight away.
@transport.event_handler("on_client_connected")
async def on_client_connected(transport, client):
    await worker.queue_frames([LLMRunFrame()])  # use your task/worker object
```

Rules:

- `simli` goes **after** the TTS (or speech-to-speech LLM) and **before** `transport.output()`.
- The transport must have `video_out_enabled=True`, with the same width/height as the Simli stream, at 25 fps.
- Don't route the TTS audio to the output around Simli: Simli's output already contains the voice, in sync.
- `is_trinity_avatar` is deprecated since 1.16 and does nothing: leave it out.

## Run and test

With Pipecat's development runner, `python bot.py` serves a prebuilt browser client at http://localhost:7860: press **Connect** and allow the microphone.

The runner is for development only. Anyone who can reach its port can start a conversation and spend the user's Simli minutes and model credit, so keep it on localhost or behind sign-in, and use Pipecat's deployment guide for production.

## Errors

| Symptom | Cause |
|---|---|
| Error with `401` at startup | `SIMLI_API_KEY` wrong or inactive |
| `400` / invalid face | wrong `SIMLI_FACE_ID` |
| `422` | unsupported video size: must be 1:1, 16:9 or 9:16, each side >= 512 (`Framing` also validates >= 512 and positions 0–1) |
| `429` | the account is running its maximum number of concurrent sessions |
| Black video, voice works | `video_out_enabled` is off, or (Pipecat ≤ 1.15) the bot hasn't spoken yet |
| Avatar never moves with GPT-Live | Pipecat ≤ 1.15: upgrade to 1.16 |
| Stretched or cropped video | transport size doesn't match the Simli stream size |

## Older Pipecat (1.15 or earlier)

Upgrade if at all possible. If not:

- **Framing:** `SimliVideoService` has no `framing` parameter. It wraps the Simli Python SDK, which sends every field of its config, so set them on the private config (check the attribute exists in the installed version):

  ```python
  simli._simli_client.config.__dict__.update(
      streaming_width=WIDTH, streaming_height=HEIGHT, avatar_position_x=0.5, avatar_position_y=1.0,
  )
  ```

- **No video until the bot first speaks** (pipecat#4832): greet on `on_client_connected` as above.
- **GPT-Live audio is ignored**: use `OpenAIRealtimeLLMService` or a separate TTS instead.
- If the constructor rejects `api_key=`/`face_id=` keywords, the version is older still and took a `simli.SimliConfig` object: check `inspect.signature(SimliVideoService.__init__)` and match it, or upgrade.

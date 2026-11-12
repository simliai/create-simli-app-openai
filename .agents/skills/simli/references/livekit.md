# Simli in LiveKit Agents

The Simli plugin adds an avatar participant to the agent's LiveKit room. The agent's voice goes to Simli, and the avatar publishes lip-synced video and voice **on the agent's behalf**, so any LiveKit frontend shows them as the agent's tracks. No frontend changes are needed beyond showing the agent's video.

Live docs: https://docs.simli.com/api-reference/livekit.md

## Requirements

- **A LiveKit server reachable from the internet**: LiveKit Cloud (free tier works) or self-hosted with a public address. `localhost` and `livekit-server --dev` do **not** work, because Simli's servers join the room from the internet.
- `SIMLI_API_KEY`, plus the usual `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (the Simli plugin reads these to give the avatar a join token).
- Python 3.10+.

```bash
pip install "livekit-agents[openai,simli]" python-dotenv
# or: uv add "livekit-agents[openai,simli]" python-dotenv
```

The starter repo pins `livekit-agents==1.8.9`. Prefer **1.8.10 or later** for new code, since the Simli plugin then supports Trinity-2 options natively (see below). On an older `livekit-agents` 1.x the same code applies; on 0.x, upgrade first.

`.env`:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
SIMLI_API_KEY=...
SIMLI_FACE_ID=bf13113a-355a-4d97-8b90-4edccd1da7b2
OPENAI_API_KEY=...
```

## The integration

The order matters: **connect → start avatar → wait for it to join → start the session → greet.** Audio the agent produces before the avatar has joined is lost.

```python
import asyncio
import os

from dotenv import load_dotenv
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli
from livekit.plugins import openai, simli

load_dotenv()

server = AgentServer()


# Explicit dispatch: the agent only joins rooms whose token names it.
@server.rtc_session(agent_name=os.getenv("LIVEKIT_AGENT_NAME") or "simli-agent")
async def entrypoint(ctx: JobContext) -> None:
    session = AgentSession(llm=openai.realtime.RealtimeModel(model="gpt-realtime", voice="marin"))

    await ctx.connect()  # connect first: wait_for_join() only waits once the room is connected

    avatar = simli.AvatarSession(
        simli_config=simli.SimliConfig(
            api_key=os.environ["SIMLI_API_KEY"],
            face_id=os.getenv("SIMLI_FACE_ID") or "bf13113a-355a-4d97-8b90-4edccd1da7b2",
            max_session_length=600,  # seconds; the avatar leaves after this
            max_idle_time=300,  # seconds without speech before the avatar leaves
        ),
    )
    await avatar.start(session, room=ctx.room)
    # If Simli refuses the session (bad key or face ID, or no free session), the plugin logs
    # the error and returns without wiring the agent's voice to the avatar.
    if session.output.audio is None:
        ctx.delete_room()
        return

    try:
        await avatar.wait_for_join(timeout=30)
    except asyncio.TimeoutError:
        ctx.delete_room()
        return

    await session.start(agent=Agent(instructions="You are a friendly voice assistant."), room=ctx.room)
    session.generate_reply(instructions="Greet the user in one short sentence.")


if __name__ == "__main__":
    cli.run_app(server)
```

Adapting to an existing agent:

- Keep the user's existing `AgentSession` (any STT/LLM/TTS pipeline works, not only OpenAI Realtime). Only add the `simli.AvatarSession` block between `ctx.connect()` and `session.start(...)`.
- If their entrypoint uses the older `WorkerOptions(entrypoint_fnc=...)` style, keep that style and insert the same avatar block.
- Keep the agent's own audio output going to the avatar: don't also publish the agent's TTS audio to the room. `avatar.start(session, ...)` reroutes `session.output.audio` for you.

## Run and test

```bash
python agent.py dev     # development, debug logs
python agent.py start   # production
```

The agent joins rooms whose token dispatches it by name (`simli-agent` above). To talk to it:

- LiveKit's Agents Playground (https://agents-playground.livekit.io): connect to the project and set **Agent name** to `simli-agent`.
- Any LiveKit agent frontend whose token request dispatches that agent name (for example `agent-starter-react`), or the starter's own web page.
- `python agent.py console` is voice-only in the terminal: there is no room, so there is no avatar.

If the user's frontend issues tokens without agent dispatch and they rely on automatic dispatch, remove `agent_name=` from `rtc_session` instead of changing the frontend.

## Trinity-2 options (16:9, position, camera, background)

**`livekit-plugins-simli` 1.8.10 and later** take the Trinity-2 options directly and send the plain face ID. Use them:

```python
simli.SimliConfig(
    api_key=os.environ["SIMLI_API_KEY"],
    face_id=face_id,
    max_session_length=600,
    max_idle_time=300,
    streaming_width=1366,  # 1:1, 16:9 or 9:16; each side >= 512
    streaming_height=768,
    avatar_position_x=0.5,
    avatar_position_y=1.0,
    camera={"zoom": 1.2},  # optional
    background_id=None,  # optional, from POST /assets/backgrounds
)
```

Note that the plugin's default `max_idle_time` is 30 seconds. Set it explicitly.

**On 1.8.9 or older**, either upgrade (`pip install -U "livekit-agents[openai,simli]"`), or subclass `SimliConfig` and override `create_json()`, which builds the body of `POST /compose/token`. Check with `pip show livekit-plugins-simli`.

```python
from dataclasses import dataclass
from typing import Any

from livekit.plugins import simli


@dataclass
class Trinity2Config(simli.SimliConfig):
    """SimliConfig plus Trinity-2 framing. Remove once the plugin supports these fields."""

    streaming_width: int = 1366  # 1:1, 16:9 or 9:16; each side >= 512
    streaming_height: int = 768
    avatar_position_x: float = 0.5  # 0 (left) .. 1 (right)
    avatar_position_y: float = 1.0  # 0 (top) .. 1 (bottom)
    camera: dict[str, float] | None = None  # e.g. {"zoom": 1.2, "orbit_y_off": 15}
    background_id: str | None = None  # from POST /assets/backgrounds
    foreground_id: str | None = None

    def create_json(self) -> dict[str, Any]:
        body = super().create_json()
        body["faceId"] = self.face_id  # plain face ID, without the legacy suffix
        for name in ("streaming_width", "streaming_height", "avatar_position_x", "avatar_position_y",
                     "camera", "background_id", "foreground_id"):
            if (value := getattr(self, name)) is not None:
                body[name] = value
        return body
```

Use `Trinity2Config(...)` in place of `simli.SimliConfig(...)`, only on plugin versions before 1.8.10.

## Errors

| Symptom | Cause |
|---|---|
| Log shows a Simli error with `401` | `SIMLI_API_KEY` wrong or inactive |
| `400` / face not found | wrong `SIMLI_FACE_ID` |
| `403` `FACE_NOT_ALLOWED` | the face is private to another Simli account |
| `429` | the account is already running its maximum number of concurrent sessions |
| `wait_for_join` times out | Simli couldn't reach the LiveKit server: `LIVEKIT_URL` must be public, not `localhost` |
| Agent never joins the room | agent name mismatch between `rtc_session(agent_name=...)` and the frontend's dispatch |

## Production notes

- Anyone who can get a token for the LiveKit project can start a conversation and spend Simli minutes and model credit. The token endpoint must sit behind the app's sign-in.
- The avatar leaves when the agent does, so ending the agent's session or deleting the room ends the Simli session and its billing.
- Deploy with `python agent.py start` on any server, or LiveKit Cloud's agent hosting.

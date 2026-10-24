"""A LiveKit voice agent on OpenAI's GPT-Live, with a Simli Trinity-2 avatar as its face.

Run it next to the web app: `uv run agent.py dev`. It joins every new room in your LiveKit
project, talks through GPT-Live, and Simli publishes the lip-synced avatar video and voice.
"""

import asyncio
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli
from livekit.plugins import openai, simli

# One .env.local for the web app and the agent, in the repo root.
load_dotenv(Path(__file__).parent.parent / ".env.local")

# Any Trinity-2 face: a preset from https://docs.simli.com/api-reference/preset-faces,
# or your own from https://app.simli.com. This one is Kate.
FACE_ID = os.getenv("SIMLI_FACE_ID") or "c060fe44-9b14-43e8-b92c-83a0e230db11"

# GPT-Live voices: quartz, ripple, vesper, willow, stone, gleam, meridian, bossa, tempo, beacon,
# delta, cinder, nuri, juni, flitz, brise, sillage, nira, harema, shida, noeul, marin.
VOICE = os.getenv("OPENAI_VOICE") or "juni"

INSTRUCTIONS = """You are Kate, a friendly assistant shown as a real-time video avatar made with Simli.
Keep every answer short and conversational: one to three sentences, no lists or markdown."""

FIRST_MESSAGE = "Hi, I'm Kate! I'm a real-time video avatar made with Simli. What would you like to talk about?"


@dataclass
class Trinity2Config(simli.SimliConfig):
    """The Simli plugin's config, for a Trinity-2 face.

    The plugin was written for older faces: it adds an emotion to the face ID and leaves the
    video square. Trinity-2 faces take the plain face ID and can stream 16:9 (or 1:1, 9:16).
    """

    width: int = 1366
    height: int = 768

    def create_json(self) -> dict:
        body = super().create_json()
        body["faceId"] = self.face_id
        body["streaming_width"] = self.width
        body["streaming_height"] = self.height
        return body


async def avatar_ready(room: rtc.Room, identity: str, timeout: float = 20) -> bool:
    """Waits until the avatar has published its video, a sign it can play audio."""

    def has_video() -> bool:
        p = room.remote_participants.get(identity)
        return bool(p) and any(t.kind == rtc.TrackKind.KIND_VIDEO for t in p.track_publications.values())

    published = asyncio.Event()
    on_track = lambda *_: has_video() and published.set()  # noqa: E731
    room.on("track_published", on_track)
    try:
        if not has_video():
            await asyncio.wait_for(published.wait(), timeout)
        return True
    except asyncio.TimeoutError:
        return False
    finally:
        room.off("track_published", on_track)


server = AgentServer()


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    # GPT-Live listens while it talks, so people can interrupt it naturally.
    session = AgentSession(llm=openai.realtime.GPTLiveModel(voice=VOICE))

    # Simli joins the room as the agent's face: it gets the agent's voice as 16 kHz audio and
    # publishes the avatar's video and voice, in sync.
    avatar = simli.AvatarSession(
        simli_config=Trinity2Config(
            api_key=os.environ["SIMLI_API_KEY"],
            face_id=FACE_ID,
            max_session_length=600,  # seconds, so a forgotten tab doesn't use up your minutes
            max_idle_time=120,
        ),
    )
    await avatar.start(session, room=ctx.room)

    await session.start(agent=Agent(instructions=INSTRUCTIONS), room=ctx.room)
    # Audio sent before Simli is ready is dropped, and the agent would wait on it forever.
    await avatar_ready(ctx.room, avatar.avatar_identity)
    # GPT-Live waits for the user by default; have Kate say hello first.
    await session.generate_reply(instructions=f'Greet the user by saying: "{FIRST_MESSAGE}"')


if __name__ == "__main__":
    cli.run_app(server)

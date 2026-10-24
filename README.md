# Simli + OpenAI GPT-Live on LiveKit

A real-time voice agent with a face. It talks through OpenAI's GPT-Live, runs on [LiveKit Agents](https://docs.livekit.io/agents/), and [Simli](https://www.simli.com) gives it a lip-synced Trinity-2 avatar.

GPT-Live listens while it talks, so you can interrupt it like a person.

## What's in here

- **`agent/`**: the voice agent, in Python. It joins every new room in your LiveKit project, talks through GPT-Live, and starts the Simli avatar.
- **The web app** (Next.js, in the repo root): a page that starts a room, sends your microphone and shows the avatar.

## Setup

You need Node.js 20+, [uv](https://docs.astral.sh/uv/) for Python, and these keys:

- [LiveKit](https://cloud.livekit.io): a project URL, API key and secret. The free tier works.
- [Simli](https://app.simli.com) (free plan included)
- [OpenAI](https://platform.openai.com/api-keys)

```bash
git clone https://github.com/simliai/create-simli-app-openai
cd create-simli-app-openai
npm install
cp .env.example .env.local   # then paste in your keys
```

Then run the agent and the web app, in two terminals:

```bash
npm run agent   # the agent: cd agent && uv run agent.py dev
npm run dev     # the web app, at http://localhost:3000
```

Open http://localhost:3000, press **Start conversation** and allow the microphone.

## Make it yours

Everything about the agent is at the top of [`agent/agent.py`](agent/agent.py):

- **Face:** any Trinity-2 face ID. Pick a [preset](https://docs.simli.com/api-reference/preset-faces) or [make your own from a photo](https://app.simli.com). Or set `SIMLI_FACE_ID`.
- **Voice:** any GPT-Live voice (the list is in the file). Or set `OPENAI_VOICE`.
- **Prompt and greeting.**
- **Tools, knowledge and more:** it's a regular LiveKit agent, so everything in the [LiveKit Agents docs](https://docs.livekit.io/agents/) applies.

## How it works

1. The page asks `app/api/token` for a token to a new LiveKit room and joins it with your microphone ([`components/LiveKitAvatar.tsx`](components/LiveKitAvatar.tsx)).
2. LiveKit sends the agent into the room. The agent connects to GPT-Live and starts a Simli avatar session.
3. Simli joins the room as the agent's face. The agent sends it GPT-Live's voice as audio, and Simli publishes the avatar's video and voice, in sync.
4. The page shows that video and plays that voice, with live captions.

All API keys stay on the server and in the agent.

## Deploying

- **Web app:** Vercel or any Next.js host. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
- **Agent:** [LiveKit Cloud](https://docs.livekit.io/agents/ops/deployment/) (`lk agent create` in `agent/`) or any server that runs `uv run agent.py start`. Set all the keys from `.env.example`.

## Before you go to production

The token route lets anyone who can reach your site start a conversation, which uses your Simli minutes and OpenAI credit. Put it behind your own sign-in or rate limiting. Each Simli session is capped at 10 minutes (`max_session_length` in `agent/agent.py`).

## More

- [Simli docs](https://docs.simli.com) and [all starters](https://docs.simli.com/api-reference/samples/all-samples)
- Questions? Ask on [Discord](https://discord.gg/yQx49zNF4d).

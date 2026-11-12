---
name: simli
description: Add a real-time talking AI avatar — a lip-synced video face — to a voice agent, chatbot or web app with Simli. Use when the user wants to give an agent a face, add a talking head, digital human, AI video avatar or lip-sync video to LiveKit Agents, Pipecat, a browser/React/Next.js app (ElevenLabs Agents, OpenAI Realtime, Vapi, any TTS) or a Python program; create a custom avatar from a photo; frame the avatar video (16:9, portrait, position, camera, background); or debug a Simli integration (no video, frozen or silent avatar, robotic audio, 401/400/403/422/429 errors).
license: MIT
---

# Simli: real-time talking avatars

Simli turns speech audio into a lip-synced video of an avatar, in real time. You send it the audio your agent speaks; it returns the avatar's video **and** voice, in sync. Usage is billed per streamed minute, so sessions must always end.

Docs: https://docs.simli.com — an index for agents is at https://docs.simli.com/llms.txt, and every page is available as Markdown by adding `.md` to its URL. If anything here conflicts with the live docs, the live docs win.

## Step 1: pick the integration path

Ask the user (or infer from their code) where the agent's voice is produced, then follow one reference file.

| The user's agent… | Path | Read |
|---|---|---|
| is (or can be) a LiveKit Agents worker, or uses LiveKit rooms | LiveKit Agents plugin `livekit-plugins-simli` | [references/livekit.md](references/livekit.md) |
| is a Pipecat pipeline | Pipecat `SimliVideoService` | [references/pipecat.md](references/pipecat.md) |
| produces audio in the browser (ElevenLabs Agents, OpenAI Realtime WebRTC, Vapi, browser TTS) | JavaScript SDK `simli-client` + a server token route | [references/browser-js.md](references/browser-js.md); for ElevenLabs Agents also [references/elevenlabs.md](references/elevenlabs.md) (complete tested app) |
| is a Python program, or renders video files / frames offline | Python SDK `simli-ai` | [references/python-sdk.md](references/python-sdk.md) |
| starting from scratch, no preference | LiveKit Agents for production; Pipecat for the fewest accounts (only an OpenAI key) | as above |

Also read [references/trinity-2.md](references/trinity-2.md) when the user wants a specific video size or shape, avatar position, camera moves, a custom background, or to create an avatar from a photo. Read [references/audio.md](references/audio.md) when audio comes from anything other than the frameworks above. Read [references/troubleshooting.md](references/troubleshooting.md) when something doesn't work.

## Step 2: get the two values every path needs

1. **`SIMLI_API_KEY`** — from https://app.simli.com (the API key section of the dashboard). Ask the user to put it in `.env` themselves. Never ask them to paste it into the chat, and never print it.
2. **A face ID** — which avatar to show. Use the user's own (dashboard → Your Avatars) or a preset. Good defaults:

| Preset | Face ID |
|---|---|
| Anna | `bf13113a-355a-4d97-8b90-4edccd1da7b2` |
| Lukas | `a36d66df-a23d-4569-996b-d0e990019857` |
| Mei | `084479bf-de7c-4df0-8d9c-5484193ecd27` |
| Mateo | `99767950-9d68-4783-a305-9118006d3363` |

The full list is at https://docs.simli.com/api-reference/preset-faces.md. All presets are Trinity-2 faces. Read the face ID from `SIMLI_FACE_ID` with a preset as the fallback, so the user can swap avatars without code changes.

Before writing integration code, check the key and face with the bundled script. It only makes read-only API calls (no session, no billed minutes) and never prints the key:

```bash
python3 scripts/check_setup.py            # reads SIMLI_API_KEY and SIMLI_FACE_ID from env or ./.env
```

If `SIMLI_FACE_ID` isn't set, the script checks the Anna preset. If there's no key yet, write the code anyway, and tell the user to run the script once they've added the key.

## Rules that apply to every path

- **The API key never reaches a browser or a mobile app.** In web apps, create a short-lived session token on the server (`POST https://api.simli.ai/compose/token`, or `generateSimliSessionToken` from `simli-client`) and send only the token to the client. Never put the key in a `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` or `EXPO_PUBLIC_` variable. Some older Simli starter repos do this for local demos — do not copy that pattern.
- **Protect whatever starts a session.** A public token route, LiveKit token endpoint, Pipecat runner, or a voice provider's signed-URL route lets anyone spend the user's minutes and credits. Put it behind the app's own sign-in or rate limiting, and tell the user if you couldn't.
- **Always bound sessions.** Set `maxSessionLength` (seconds; e.g. 600) and `maxIdleTime` (seconds without audio; e.g. 120–300). The defaults are long (1 hour / 5 minutes). Stop the session when the conversation ends (`stop()`, leaving the room, or ending the pipeline) and on page unload.
- **Audio is raw PCM16, 16 kHz, mono, little-endian, no header.** The LiveKit and Pipecat integrations convert for you. Anywhere else, convert first — wrong formats give silence, noise or chipmunk speech. See [references/audio.md](references/audio.md).
- **Wait for the avatar before speaking.** Start the Simli session first and let the agent talk only once the avatar is ready (`await avatar.wait_for_join()` in LiveKit; `await simliClient.start()` in the browser). Audio sent earlier is lost.
- **Play Simli's audio, not the original.** Simli returns the avatar's voice in sync with the video. Don't also play the agent's original audio, or the user hears everything twice and out of sync.
- **On interruption, clear the buffer** (`ClearBuffer()` in JS, `clearBuffer()` in Python) so the avatar stops talking when the user barges in. The LiveKit and Pipecat integrations do this for you.

## Make the first session look good

A demo that works but looks wrong is the main reason people give up. Before calling it done:

- **Match the video shape to the layout.** The default stream is 768x768: keep it for a square tile. For a desktop video-call layout use 16:9 (`1366x768`); for mobile portrait use 9:16 (`768x1366`). Set the same size in the framework's video output and the player's CSS `aspect-ratio`. See [references/trinity-2.md](references/trinity-2.md).
- **Greet immediately.** Have the agent say a short greeting as soon as the avatar is ready, so the user sees it come alive instead of a still face. For hosted agents (ElevenLabs, Vapi) this is the agent's "first message" setting: tell the user to set it.
- **Avoid self-interruption.** The avatar's voice plays from the speakers while the mic is open. Open the mic with `echoCancellation: true`, and suggest headphones if the agent still hears itself.
- **Show the video properly.** `<video autoPlay playsInline>` plus a separate `<audio autoPlay>`. Size the element with CSS `object-fit: cover` (or `contain`) to the stream's aspect ratio. Start sessions from a user click, so browsers allow audio autoplay.
- **Show a loading state** while the session starts (usually a couple of seconds), and a clear message if it fails.
- **Use `handleSilence: true`** (the default) when the agent sends audio in bursts, so the avatar keeps moving naturally between sentences. Use `false` only when streaming a continuous track that already contains its own silence (see [references/browser-js.md](references/browser-js.md)).

## Definition of done

- [ ] `scripts/check_setup.py` passes for the key and face in use
- [ ] The API key is only on the server, read from an environment variable, and `.env` is in `.gitignore`
- [ ] Sessions have `maxSessionLength` and `maxIdleTime`, and are stopped when the conversation ends
- [ ] The avatar is ready before the agent's first words, and the agent greets the user
- [ ] Only Simli's audio is played; interruptions clear the avatar's buffer
- [ ] The video size matches the UI, and the element is styled for that aspect ratio
- [ ] Errors from Simli are surfaced to the user (not swallowed), with the message from [references/troubleshooting.md](references/troubleshooting.md)
- [ ] The user has been told how to run it, and that the session-starting endpoint needs auth or rate limiting before deploying

## Complete example apps

Each is maintained by Simli and keeps every key on the server (check that the repo's README doesn't use `NEXT_PUBLIC_` keys; versions before November 2026 did); clone one when the user wants a runnable project rather than an integration into existing code:

- LiveKit Agents + OpenAI Realtime + web page: https://github.com/simliai/create-simli-app-livekit-agents
- Pipecat + OpenAI Realtime + web page: https://github.com/simliai/create-simli-app-pipecat
- ElevenLabs Agents in Next.js: https://github.com/simliai/create-simli-app-elevenlabs
- Vapi in the browser: https://github.com/simliai/create-simli-app-vapi
- OpenAI Realtime (WebRTC) in Next.js: https://github.com/simliai/create-simli-app-openai
- Deepgram + OpenAI + ElevenLabs in Next.js with its own server: https://github.com/simliai/create-simli-app

Support: Discord https://discord.gg/yQx49zNF4d

# Create Simli App (OpenAI)

A Next.js starter where an [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime) voice agent talks to you through a real-time [Simli](https://simli.com) video avatar.

- **OpenAI Realtime over WebRTC** in the browser. Your server creates the call (OpenAI's "unified interface"), so no OpenAI credential of any kind reaches the browser.
- **Simli** turns the model's voice into a lip-synced avatar video. You hear Simli's in-sync audio only; the model's original audio is never played.
- **No API key reaches the browser.** Both keys stay in server-side environment variables; the browser only gets a short-lived Simli session token and an SDP answer.

Simli docs: https://docs.simli.com

## How it works

```
Browser                                   Your Next.js server              Providers
───────                                   ───────────────────              ─────────
click "Test Interaction"
  ├─ mic permission (echo cancellation)
  ├─ POST /api/simli-token  ────────────► SIMLI_API_KEY  ────────────────► Simli: session token
  ├─ SimliClient.start()  (avatar on screen)
  ├─ POST /api/openai-session (SDP offer) ► OPENAI_API_KEY + session config ► OpenAI POST /v1/realtime/calls
  │                         ◄── SDP answer ┘  + hang-up timer (600 s) ──────► /v1/realtime/calls/{id}/hangup
  └─ WebRTC media + "oai-events" data channel directly with OpenAI
       model audio track ──► simliClient.listenToMediastreamTrack()  ──► avatar video + voice
       "speech_started"  ──► simliClient.ClearBuffer()  (barge-in)
```

1. The avatar starts first; the OpenAI call opens only once the avatar is on screen, then the model greets the user.
2. The model, voice and instructions are set on the server (`app/avatar.ts`) when the server creates the call.
3. Ending either side ends both: the Stop button, Simli's session limits, OpenAI hanging up, errors, leaving the page or closing the tab.
4. Time limits (see [Limits](#limits)): Simli ends its session after 600 s, and the server hangs up the OpenAI call after about 600 s even if the page doesn't.

## Setup

Requirements: Node.js 20.9+ and a browser with microphone access (localhost or HTTPS).

1. Get your keys: a Simli API key from https://app.simli.com and an OpenAI API key from https://platform.openai.com/settings/organization/api-keys.
   If you want to try Simli but don't have access to these, ask in [Discord](https://discord.gg/yQx49zNF4d).

2. Create `.env.local` from the example and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   ```bash
   SIMLI_API_KEY=...
   SIMLI_FACE_ID=14c60d62-6ebf-424d-b626-1f4f91c33b04   # optional; default is Simli's default Trinity-2 face
   OPENAI_API_KEY=...
   ```

   These are server-only variables. Never rename them to `NEXT_PUBLIC_*`.

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://127.0.0.1:3000 (the dev server listens on 127.0.0.1 only), click **Test Interaction**, allow the microphone, and talk. Headphones help if the avatar hears itself and interrupts.

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`.

## Customize the avatar

- **Prompt, voice, model:** edit `app/avatar.ts` (server-only).
  The default model is `gpt-realtime-2.1`; `gpt-realtime-2.1-mini` is cheaper and faster. OpenAI recommends the `marin` (female) and `cedar` (male) voices. Match the voice to the face: the default face is a woman, so the default voice is `marin`.
- **Face:** set `SIMLI_FACE_ID`. Use one of your own avatars (dashboard → Your Avatars) or a [preset face](https://docs.simli.com/api-reference/preset-faces):

  | Preset | Face ID |
  |---|---|
  | Simli's default Trinity-2 face (default) | `14c60d62-6ebf-424d-b626-1f4f91c33b04` |
  | Lukas | `a36d66df-a23d-4569-996b-d0e990019857` |
  | Mei | `084479bf-de7c-4df0-8d9c-5484193ecd27` |
  | Mateo | `99767950-9d68-4783-a305-9118006d3363` |

  If you change the face, update the name and voice in `app/avatar.ts` to match.
  You can also [create your own avatar](https://app.simli.com) from a photo.
- **Video shape:** the stream is 16:9 (1366x768, Trinity-2's full frame) to match the `aspect-video` player in `app/Components/VideoBox.tsx`. For a square layout, set `streaming_width: 768, streaming_height: 768` in `app/api/simli-token/route.ts` and change the player (and the placeholder in `app/Components/DottedFace.tsx`) to `aspect-square`. The two must match. See [Trinity-2 framing](https://docs.simli.com/api-reference/trinity-2).
- **Session limits:** `SESSION_MAX_SECONDS` (600) and `SIMLI_MAX_IDLE_SECONDS` (180) in `lib/server-env.ts`. See [Limits](#limits).

## Limits

What is capped, and by whom:

| | Cap | Enforced by |
|---|---|---|
| Simli session length | 600 s (`maxSessionLength`) | Simli's servers |
| Simli idle time | 180 s without audio (`maxIdleTime`) | Simli's servers. **May never fire** while the OpenAI call is connected: a WebRTC audio track keeps delivering (silent) audio. Rely on the length cap. |
| OpenAI call length | ~615 s: the route calls `POST /v1/realtime/calls/{id}/hangup` | **A timer in your server process.** Reliable with `next start` or any long-running Node server. **Not reliable on serverless** (e.g. Vercel functions), which may freeze or recycle the instance after the response; a restart also drops pending timers. |
| OpenAI call length, fallback | 60 minutes | OpenAI's maximum Realtime session length |
| Either side | when the page closes, the user clicks Stop, or the other side ends | the browser code (not a security boundary) |

On serverless, either run the app as a long-running Node server, or move the hang-up to something that survives: a queue/scheduled job (for example Upstash QStash or a cron) that calls the hang-up endpoint with the call ID, or a [server-side control connection](https://developers.openai.com/api/docs/guides/voice-server-controls?api=realtime) (`wss://api.openai.com/v1/realtime?call_id=...`) held by a worker. In every case, set a budget on the OpenAI project.

## Before you deploy

The two API routes start sessions that are billed to your accounts, and as shipped they have **no authentication**. So in production they **fail closed**: both return `403` unless `ALLOW_UNAUTHENTICATED_SESSIONS=true`. Before deploying:

- [ ] **Add auth and rate limiting** where the `TODO`s are (`rejectUnlessSessionsAllowed()` in `lib/server-env.ts`, called by both routes). For example, require your app's signed-in session and limit sessions per user and per IP (your host's firewall, or a store like Upstash/Redis). Only set `ALLOW_UNAUTHENTICATED_SESSIONS=true` if you accept that anyone can start sessions.
- [ ] **Know what is capped server-side** (see [Limits](#limits)). The Simli cap is enforced by Simli. The OpenAI hang-up timer only works on a long-running server; on serverless, add a durable hang-up or accept OpenAI's 60-minute maximum.
- [ ] **Set provider limits:** a monthly budget / usage limit on the OpenAI project (use a dedicated project for this app), and check your Simli plan's concurrency and minutes.
- [ ] **Rotate old keys.** Earlier versions of this starter put both keys in `NEXT_PUBLIC_` variables, which are embedded in the JavaScript sent to every visitor. If you ever deployed or shared a build of an earlier version, rotate **both** your Simli and OpenAI API keys.
- [ ] If you have signed-in users, send a hashed user ID as the `OpenAI-Safety-Identifier` header (see the comment in `app/api/openai-session/route.ts`).
- [ ] Set `SIMLI_API_KEY`, `OPENAI_API_KEY` (and optionally `SIMLI_FACE_ID`) in your host's environment settings. Never commit `.env*` files (they are git-ignored, except `.env.example`).
- [ ] Serve over HTTPS (browsers require it for the microphone).

In production, error responses are generic (details go to the server log). The app also sends `Content-Security-Policy: frame-ancestors 'self'`, `Permissions-Policy: microphone=(self), camera=()`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` (see `next.config.ts`).

Note: the session config is set on the server, but the browser holds the call's data channel, so it can still send `session.update` events (for example, to change the instructions for its own call) until the call is hung up. It can't change the model or get your API key. Don't put secrets in the prompt, and keep sensitive actions (tools) on the server.

## Deploy on Vercel

The app deploys to [Vercel](https://vercel.com/new) as a standard Next.js project. Add the environment variables in the project settings and complete the checklist above first.

## Want the agent on a server instead?

This starter runs the voice agent in the browser. For a server-side agent (tools and business logic on your backend, telephony, more control), use Simli with [LiveKit Agents](https://github.com/simliai/create-simli-app-livekit-agents) or [Pipecat](https://github.com/simliai/create-simli-app-pipecat).

## Using a coding agent?

This repo includes the Simli agent skill in `.agents/skills/simli` (also linked at `.claude/skills/simli`), so coding agents (for example Claude Code) know how to use Simli correctly when you change this app. To install it in another project, run:

```bash
npx skills add simliai/skills
```

## Troubleshooting

- **"... is not set on the server"**: create `.env.local` (see Setup) and restart `npm run dev`.
- **403 "Sessions are disabled on this deployment"**: production fails closed; see [Before you deploy](#before-you-deploy).
- **Avatar doesn't move / no sound**: check the browser console, and that nothing blocks `*.simli.ai` (VPN, firewall). Start from a click so the browser allows audio.
- **The avatar interrupts itself**: use headphones; the microphone is opened with echo cancellation, but loud speakers can still leak.
- **Too many sessions (429)**: stop other sessions; closed tabs end their session automatically.
- More: https://docs.simli.com and [Discord](https://discord.gg/yQx49zNF4d).

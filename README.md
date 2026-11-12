# Create Simli App (OpenAI)

A Next.js starter where an [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime) voice agent talks to you through a real-time [Simli](https://simli.com) video avatar.

- **OpenAI Realtime over WebRTC** in the browser, authenticated with a short-lived ephemeral client secret minted by the server.
- **Simli** turns the model's voice into a lip-synced avatar video. You hear Simli's in-sync audio only; the model's original audio is never played.
- **No API key reaches the browser.** Both keys stay in server-side environment variables; the browser only gets short-lived tokens from two API routes.

Simli docs: https://docs.simli.com

## How it works

```
Browser                                   Your Next.js server              Providers
───────                                   ───────────────────              ─────────
click "Test Interaction"
  ├─ mic permission (echo cancellation)
  ├─ POST /api/simli-token  ────────────► SIMLI_API_KEY  ────────────────► Simli: session token
  ├─ POST /api/openai-session ──────────► OPENAI_API_KEY + session config ► OpenAI: ephemeral secret (ek_…)
  ├─ SimliClient.start()  (avatar on screen)
  └─ WebRTC call to api.openai.com/v1/realtime/calls with the ephemeral secret
       model audio track ──► simliClient.listenToMediastreamTrack()  ──► avatar video + voice
       "speech_started"  ──► simliClient.ClearBuffer()  (barge-in)
```

1. The avatar starts first; the OpenAI call opens only once the avatar is on screen, then the model greets the user.
2. The model, voice and instructions are set on the server (`app/avatar.ts`) when the ephemeral secret is minted.
3. Ending either side ends both: the Stop button, Simli's session limits, OpenAI hanging up, errors, leaving the page or closing the tab.

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
   SIMLI_FACE_ID=bf13113a-355a-4d97-8b90-4edccd1da7b2   # optional; default is the "Anna" preset
   OPENAI_API_KEY=...
   ```

   These are server-only variables. Never rename them to `NEXT_PUBLIC_*`.

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:3000, click **Test Interaction**, allow the microphone, and talk. Headphones help if the avatar hears itself and interrupts.

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`.

## Customize the avatar

- **Prompt, voice, model:** edit `app/avatar.ts` (server-only).
  The default model is `gpt-realtime-2.1`; `gpt-realtime-2.1-mini` is cheaper and faster. OpenAI recommends the `marin` and `cedar` voices.
- **Face:** set `SIMLI_FACE_ID`. Use one of your own avatars (dashboard → Your Avatars) or a [preset face](https://docs.simli.com/api-reference/preset-faces):

  | Preset | Face ID |
  |---|---|
  | Anna (default) | `bf13113a-355a-4d97-8b90-4edccd1da7b2` |
  | Lukas | `a36d66df-a23d-4569-996b-d0e990019857` |
  | Mei | `084479bf-de7c-4df0-8d9c-5484193ecd27` |
  | Mateo | `99767950-9d68-4783-a305-9118006d3363` |

  If you change the face, update the name and voice in `app/avatar.ts` to match.
  You can also [create your own avatar](https://app.simli.com) from a photo.
- **Video shape:** the UI shows a square avatar box, so the Simli stream is square (768x768). For a 16:9 layout, set `streaming_width: 1366, streaming_height: 768` in `app/api/simli-token/route.ts` and change the box in `app/Components/VideoBox.tsx` to `aspect-video`. The two must match.
- **Session limits:** `maxSessionLength` (600 s) and `maxIdleTime` (180 s) in `app/api/simli-token/route.ts`.

## Before you deploy

The two API routes start sessions that are billed to your accounts. As shipped, **anyone who can reach your site can call them.** Before deploying:

- [ ] **Add auth and/or rate limiting** to `app/api/simli-token/route.ts` and `app/api/openai-session/route.ts` (both have a `TODO`). For example, require your app's signed-in session, and limit sessions per user and per IP (for example with your hosting provider's firewall or a store like Upstash/Redis).
- [ ] If you have signed-in users, send a hashed user ID as the `OpenAI-Safety-Identifier` header when minting the OpenAI secret (see the comment in the route).
- [ ] Set `SIMLI_API_KEY`, `OPENAI_API_KEY` (and optionally `SIMLI_FACE_ID`) in your host's environment settings. Never commit `.env*` files (they are git-ignored, except `.env.example`).
- [ ] Review `maxSessionLength` / `maxIdleTime` and set spending limits in the OpenAI and Simli dashboards.
- [ ] Serve over HTTPS (browsers require it for the microphone).

Note: the ephemeral OpenAI secret is bound to the server's session config, but like any Realtime client the browser can still send `session.update` events on its own call (for example, to change the instructions for that one session). It can't change the model or get your API key. Don't put secrets in the prompt, and keep sensitive actions (tools) on the server.

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
- **Avatar doesn't move / no sound**: check the browser console, and that nothing blocks `*.simli.ai` (VPN, firewall). Start from a click so the browser allows audio.
- **The avatar interrupts itself**: use headphones; the microphone is opened with echo cancellation, but loud speakers can still leak.
- **Too many sessions (429)**: stop other sessions; closed tabs end their session automatically.
- More: https://docs.simli.com and [Discord](https://discord.gg/yQx49zNF4d).

# Simli in the browser: `simli-client`

Use this path when the agent's voice is already in the browser: ElevenLabs Agents, OpenAI Realtime over WebRTC, Vapi, a TTS response fetched by the page, or the user's own pipeline. The page sends audio to Simli and plays the avatar's video and voice in a `<video>` and an `<audio>` element.

Live docs: https://docs.simli.com/api-reference/javascript.md (guide), https://docs.simli.com/api-reference/javascript/reference.md (every method and event).

```bash
npm install simli-client   # v3.x
```

The architecture always has two halves:

1. **Server:** a route that holds `SIMLI_API_KEY` and returns a short-lived **session token**.
2. **Browser:** fetches a token, creates a `SimliClient`, starts it, sends audio.

## 1. Server: session token route

**Next.js (App Router)** — `app/api/simli-token/route.ts`:

```typescript
import { generateSimliSessionToken } from "simli-client";

export async function POST() {
  // TODO: check the user's session here (auth / rate limit) before minting a token.
  try {
    const { session_token, warnings } = await generateSimliSessionToken({
      apiKey: process.env.SIMLI_API_KEY!,
      config: {
        faceId: process.env.SIMLI_FACE_ID || "bf13113a-355a-4d97-8b90-4edccd1da7b2", // || so an empty var falls back
        maxSessionLength: 600, // seconds
        maxIdleTime: 180, // seconds
        handleSilence: true, // see "handleSilence" below
        // For 16:9 (desktop) — the player's CSS aspect-ratio must match:
        // streaming_width: 1366, streaming_height: 768,
        // For 9:16 (mobile portrait): streaming_width: 768, streaming_height: 1366,
      },
    });
    if (warnings?.length) console.warn("Simli:", warnings);
    return Response.json({ session_token });
  } catch (err) {
    // generateSimliSessionToken throws the API's response body text
    console.error("Simli token error:", err);
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
```

**Any other backend** (Express, FastAPI, Rails, a serverless function) — call the REST endpoint directly:

```bash
curl -X POST https://api.simli.ai/compose/token \
  -H "x-simli-api-key: $SIMLI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"faceId":"bf13113a-355a-4d97-8b90-4edccd1da7b2","maxSessionLength":600,"maxIdleTime":180}'
# -> {"session_token": "...", "warnings": []}
```

```typescript
// Express
app.post("/api/simli-token", requireUser, async (_req, res) => {
  const r = await fetch("https://api.simli.ai/compose/token", {
    method: "POST",
    headers: { "x-simli-api-key": process.env.SIMLI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ faceId: process.env.SIMLI_FACE_ID, maxSessionLength: 600, maxIdleTime: 180 }),
  });
  if (!r.ok) return res.status(502).json({ error: await r.text() });
  const { session_token } = await r.json();
  res.json({ session_token });
});
```

Token config fields (all optional except `faceId`): `handleSilence` (default `true`), `maxSessionLength` (default 3600 s), `maxIdleTime` (default 300 s), plus the Trinity-2 fields `streaming_width`, `streaming_height`, `avatar_position_x`, `avatar_position_y`, `camera`, `background_id`, `foreground_id` (see [trinity-2.md](trinity-2.md)).

Never call `generateSimliSessionToken` from client components, and never expose the key through `NEXT_PUBLIC_*` / `VITE_*` variables — even "just for the demo".

## 2. Browser: start a session

```tsx
"use client";
import { useRef, useState } from "react";
import { SimliClient, LogLevel } from "simli-client";

export function Avatar() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliClient | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [error, setError] = useState("");

  async function start() {
    // Must run from a user gesture (click), so the browser allows audio playback.
    setStatus("starting");
    try {
      const res = await fetch("/api/simli-token", { method: "POST" });
      if (!res.ok) throw new Error(`Token route failed: ${res.status} ${await res.text()}`);
      const { session_token } = await res.json();

      // The constructor opens the connection: create it right before start().
      const client = new SimliClient(session_token, videoRef.current!, audioRef.current!, null, LogLevel.ERROR);
      // "stop" also fires after our own stop(); the ref check keeps that from looking like a remote end.
      client.on("stop", () => { if (clientRef.current === client) { clientRef.current = null; setStatus("idle"); } });
      // During start(), Simli refusals fire "error" AND reject start(): keep handling idempotent.
      client.on("error", (detail) => { setError(explainSimliError(detail)); setStatus("error"); });
      clientRef.current = client;
      await client.start(); // resolves when the first video frame is on screen
      setStatus("live");
      // Now start the voice agent / send audio (see below).
    } catch (e) {
      setError(explainSimliError(String(e))); // helper in troubleshooting.md
      setStatus("error");
    }
  }

  async function stop() {
    const client = clientRef.current;
    clientRef.current = null;
    setStatus("idle");
    await client?.stop();
  }

  return (
    <div>
      {/* muted: the voice plays through the separate <audio>, which is Simli's in-sync audio */}
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }} />
      <audio ref={audioRef} autoPlay />
      {status === "starting" && <p>Connecting…</p>}
      {status === "error" && <p role="alert">{error}</p>}
      {status === "live" ? <button onClick={stop}>End</button> : <button onClick={start}>Start</button>}
    </div>
  );
}
```

- Set the CSS `aspectRatio` to the stream's shape (`1 / 1` for the default 768x768, `16 / 9` for 1366x768).
- A `SimliClient` runs **one** session. To restart, fetch a new token and create a new client.
- Register `on(...)` handlers before `start()`.
- Stop the client on unmount and on `pagehide`, so closed tabs don't keep billing until `maxIdleTime`. `pagehide` can't wait for the async `stop()`; that's fine, since Simli also ends the session when the connection drops.
- If the page also runs a voice agent connection, link the two lifecycles: when either ends, end both.
- `LogLevel.DEBUG` logs every audio chunk: use `INFO` while developing and `ERROR` in production.

## 3. Feeding audio

Choose one style.

### A. Chunks you already have (`sendAudioData`)

For TTS responses, ElevenLabs WebSocket audio events, or any buffer of PCM16 16 kHz mono:

```typescript
client.sendAudioData(pcm16Bytes); // Uint8Array; ~6000-byte chunks work well; queued after earlier audio
client.ClearBuffer();             // on user interruption: drop audio not yet spoken
client.sendAudioDataImmediate(b); // drop the queue and play this now
```

Keep `handleSilence: true` (token config) so the avatar keeps moving naturally between bursts.

If the source is not PCM16 16 kHz mono (OpenAI Realtime outputs 24 kHz; many TTS APIs return MP3 or 22.05/44.1 kHz), convert first — see [audio.md](audio.md).

### B. A live audio track (`listenToMediastreamTrack` / `listenToAudioElement`)

For a remote WebRTC audio track (OpenAI Realtime over WebRTC, Vapi, Daily, LiveKit) or an `<audio>` element that plays the agent's voice:

```typescript
client.listenToMediastreamTrack(remoteAudioTrack); // a MediaStreamTrack; the SDK converts and sends it
// or
client.listenToAudioElement(agentAudioEl); // also mutes that element: the user hears the avatar instead
```

Set `handleSilence: false` in the token config for this style: a live track already carries its own silence, and Simli's gap filling would cut into it and cause audio artifacts.

**Don't play the original track as well.** With `listenToMediastreamTrack`, attach the remote stream to a **muted** `<audio>` element (Chrome may feed silence to Web Audio from a remote WebRTC track that isn't attached to any media element), and never to an unmuted one. With `listenToAudioElement` the SDK mutes it for you. The user should only hear `audioRef` (Simli's in-sync voice).

With a continuous track, the track keeps sending audio (including silence), so `maxIdleTime` may never trigger: rely on `maxSessionLength` and your own end-of-conversation handling.

## Recipes

Simli's maintained starters implement each of these end to end; read one when the user wants a complete app. Each keeps every secret on the server.

### ElevenLabs Agents (WebSocket)

**Read [elevenlabs.md](elevenlabs.md)**: a complete Next.js app (token route, signed-URL route, client component with mic capture, lifecycle and error handling). Starter: https://github.com/simliai/create-simli-app-elevenlabs. Key points:

- Both keys stay on the server: Simli via the token route, ElevenLabs via a signed-URL route: `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=...` (hyphenated path; older docs used `get_signed_url`), header `xi-api-key`, response `{signed_url}`. Signed URLs expire after about 15 minutes, so fetch one per conversation. Use either signed URLs (agent authentication on) or a domain allowlist, not both.
- The ElevenLabs agent's output audio format must be **PCM 16000 Hz** (`pcm_16000`). Its greeting is the agent's **First message** setting.
- Start Simli first, then open the ElevenLabs socket. `audio` events go to `sendAudioData`, `interruption` to `ClearBuffer()`, `ping` gets `{type: "pong", event_id}`. Show `client_error` messages and unexpected close codes to the user.
- Use `handleSilence: true`.
- Prefer the raw WebSocket over the ElevenLabs JS SDK (`@elevenlabs/client`) here: in WebSocket mode the SDK always plays the agent's audio itself (`onAudio` gives you the audio, but playback can only be silenced with `setVolume(0)` after the session starts), and in WebRTC mode it doesn't expose the remote track. If the user's app already depends on the SDK, use `onAudio` → `sendAudioData` plus `setVolume(0)` immediately after start, and say that it's timing-dependent.

### OpenAI Realtime (WebRTC, ephemeral key)

Starter: https://github.com/simliai/create-simli-app-openai. Running OpenAI Realtime on a server with LiveKit Agents or Pipecat ([livekit.md](livekit.md), [pipecat.md](pipecat.md)) is the more robust production choice; the browser path is:

1. **Server route** (`POST /api/openai-session`): mint an ephemeral client secret with `POST https://api.openai.com/v1/realtime/client_secrets` using `OPENAI_API_KEY`, with the session config set there (`session: { type: "realtime", model, instructions, audio: { output: { voice } } }`, plus `expires_after`). The browser never chooses the model or prompt. Use the current realtime model and a recommended voice (for example `marin`) from OpenAI's docs (https://developers.openai.com/api/docs/guides/voice-webrtc).
2. **Browser:** create an `RTCPeerConnection`, add the mic track, open the `oai-events` data channel, then POST the SDP offer to `https://api.openai.com/v1/realtime/calls` (`Content-Type: application/sdp`, `Authorization: Bearer <ephemeral secret>`).
3. **Audio to Simli:** in `pc.ontrack`, attach the stream to a **muted** `<audio>`, then `simliClient.listenToMediastreamTrack(event.track)` with `handleSilence: false` in the Simli token config.
4. **Greeting:** when the data channel opens (and Simli's `start()` has resolved), send `{"type": "response.create"}` so the model speaks first.
5. **Barge-in:** server VAD stops the model's response itself; also call `ClearBuffer()` on `input_audio_buffer.speech_started` from the data channel, to drop audio Simli has queued.
6. **WebSocket API instead of WebRTC:** audio deltas are base64 PCM16 at **24 kHz**: resample to 16 kHz before `sendAudioData` ([audio.md](audio.md)).

Notes: OpenAI's Agents SDK (`@openai/agents`, `RealtimeSession`) accepts your own muted `audioElement`, but sends the browser-side agent's instructions and voice on connect, so it can't keep the config server-side. The browser can still send `session.update` on its own call (it can't change the model or get the key), so treat the prompt as visible to users. Don't use the deprecated `@openai/realtime-api-beta` library. Check OpenAI's docs for GPT-Live, which OpenAI recommends for new voice apps; on a server, Pipecat 1.16+ passes GPT-Live's voice to Simli.

### Vapi

Starter: https://github.com/simliai/create-simli-app-vapi (`@vapi-ai/web` 3.x, which needs Node.js 22.14+).

- Only Vapi's **public** key goes to the browser (that's how Vapi's web SDK works): name it `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, restrict its allowed origins and assistants in the Vapi dashboard, and keep transient assistants disabled. The private key never goes client-side; for a stricter setup, sign a short-lived Vapi token on the server. The Simli key stays server-side as always.
- Get the assistant's audio: `vapi.on("audio", (player) => …)` or `vapi.getAudioPlayer()`, then take the track from `player.srcObject`. Silence Vapi's own playback with `vapi.setVolume(0)`.
- Two audio styles work: stream the track (`listenToMediastreamTrack`, `handleSilence: false`, lowest latency), or, as the starter does for better lip-sync, buffer the assistant's speech between Vapi's `speech-start` and `speech-end` events and send it with `sendAudioDataImmediate` (first ~1 s) then `sendAudioData` (`handleSilence: true`), at the cost of about 1 s extra delay. `speech-start`/`speech-end` come from an audio-level check that stays "speaking" for about 1 s after the last sound.
- Interruptions: call `ClearBuffer()` on the `message` event with `type === "user-interrupted"`.

### Your own STT → LLM → TTS pipeline

Starter: https://github.com/simliai/create-simli-app (Deepgram + OpenAI + ElevenLabs, one Node server).

- `generateSimliSessionToken` works from any Node server, not just Next.js route handlers.
- Run STT, LLM and TTS on the server; stream TTS audio to the browser as PCM16 16 kHz (for example ElevenLabs `output_format=pcm_16000` with `eleven_flash_v2_5`, key in the `xi-api-key` header, `flush: true` at the end of each turn; Cartesia `pcm_s16le` at 16000; OpenAI TTS `response_format=pcm` is 24 kHz and needs resampling). The browser calls `sendAudioData` as chunks arrive, with `handleSilence: true`.
- Barge-in without a provider "interruption" event: treat the first non-empty interim transcript from STT as the interruption. On the server, stop sending stale TTS audio *before* sending the interrupt message on the same ordered socket, and cancel the in-flight LLM and TTS requests; in the browser, `ClearBuffer()`.
- Greet first: once Simli's `start()` resolves, have the server synthesize a greeting.
- Protect the server's socket: check `Origin`, require a short-lived ticket from an authenticated endpoint, bound message sizes and rates, and close idle connections.

## Layout

Match the stream to the UI that exists. If the layout is a square tile, keep the default 768x768 and style the player `aspect-ratio: 1 / 1`; switch to 1366x768 (16:9) or 768x1366 (9:16) only when the layout is that shape.

## Browser quirks

- Capturing the mic into `new AudioContext({ sampleRate: 16000 })` can fail in some Firefox versions (a mic source can't connect to a context at a different rate). Fall back to the default rate and resample to 16 kHz inside the AudioWorklet.
- Safari may need `audioContext.resume()` inside the click handler.

## Peer-to-peer mode (optional)

The default transport (`"livekit"`, via Simli's media servers) needs nothing extra and works behind strict firewalls. Peer-to-peer can shave a little latency but needs ICE servers from a second server route (`generateIceServers(process.env.SIMLI_API_KEY!)`), then `new SimliClient(token, video, audio, iceServers, LogLevel.ERROR, "p2p")`. Only suggest it if the user asks about latency.

## Errors

`start()` rejects immediately (no retry) when Simli refuses the session — the message is a string like `"ERROR: INVALID_FACE_ID"`. It retries only network failures (up to 10 times, with backoff) and then rejects with `"Too Many Retry Attempts Failed to connect"`. See [troubleshooting.md](troubleshooting.md).

Useful events: `error`, `stop`, `startup_error` (each failed attempt), `speaking` / `silent` (drive a "talking" indicator), `destination` (contains the `session_id`: log it and include it when reporting issues to Simli).

# ElevenLabs Agents + Simli: complete Next.js example

A tested, minimal Next.js (App Router, TypeScript) app: click **Start**, talk to an ElevenLabs Conversational AI agent, and it answers through a Simli avatar at 16:9. It type-checks and builds with `next@14.2.35`, `react@18`, `simli-client@3.2.0`; the same code is used in https://github.com/simliai/create-simli-app-elevenlabs on Next 16 / React 19, which also handles a few more edge cases (cancelling a start in progress, `client_error`, the agent's reported input format, a Firefox mic fallback). Copy these files into the user's app and adapt the UI; keep the order and the lifecycle handling.

## How it fits together

1. **Simli first.** The page gets a Simli session token from its own server route and starts `SimliClient`. Only when `start()` has resolved (the avatar is on screen) does it connect to ElevenLabs, so the agent's first words aren't lost.
2. **ElevenLabs over WebSocket.** The page gets a signed URL from a second server route (the ElevenLabs key stays on the server) and opens it.
   - Agent `audio` events go to `simli.sendAudioData` and are never played directly.
   - `interruption` calls `ClearBuffer()`.
   - `ping` is answered with `pong`.
3. **Microphone.** The mic is captured with an AudioWorklet at 16 kHz, converted to PCM16 and sent as base64 `user_audio_chunk` messages.
4. **Linked lifecycles.** Ending either side ends both: the user clicking End, ElevenLabs closing the conversation, Simli's `stop` (max length or idle), errors, unmount and `pagehide`. `cleanup()` is idempotent, because the `error` event and a rejected `start()` can both fire for one failure.

## Set up the ElevenLabs agent (tell the user)

In the ElevenLabs dashboard, on the agent:

- **Agent output audio format: PCM 16000 Hz** (`pcm_16000`). Without this the avatar gets audio it can't use. The page checks the format the agent reports when the conversation starts, and stops with a clear message if it's wrong.
- **First message:** set a short greeting, so the avatar speaks as soon as the conversation opens.
- If the agent is public (no auth), the signed URL is still the safer pattern. It also works with private agents.

Echo: Simli's voice plays from the speakers while the mic is open. The mic is opened with `echoCancellation: true`. Recommend headphones if the agent still interrupts itself.

## `.env.example`

```bash
SIMLI_API_KEY=
SIMLI_FACE_ID=bf13113a-355a-4d97-8b90-4edccd1da7b2
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
```

Both routes spend money (Simli minutes, ElevenLabs credits). Put both behind the app's sign-in or rate limiting before deploying.

## `app/api/simli-token/route.ts`

```typescript
import { generateSimliSessionToken } from "simli-client";

export const dynamic = "force-dynamic";

// TODO before deploying: check the user's session (auth) and/or rate limit here.
// Anyone who can call this route can spend your Simli minutes.
export async function POST() {
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) return Response.json({ error: "SIMLI_API_KEY is not set on the server" }, { status: 500 });
  try {
    const { session_token, warnings } = await generateSimliSessionToken({
      apiKey,
      config: {
        faceId: process.env.SIMLI_FACE_ID || "bf13113a-355a-4d97-8b90-4edccd1da7b2",
        maxSessionLength: 600, // seconds
        maxIdleTime: 180, // seconds without audio
        handleSilence: true, // ElevenLabs audio arrives in bursts
        streaming_width: 1366, // 16:9
        streaming_height: 768,
      },
    });
    if (warnings?.length) console.warn("Simli:", warnings);
    return Response.json({ session_token });
  } catch (err) {
    console.error("Simli token error:", err);
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
```

## `app/api/elevenlabs-signed-url/route.ts`

```typescript
export const dynamic = "force-dynamic";

// TODO before deploying: protect this route too (auth / rate limit).
export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return Response.json({ error: "ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID are not set on the server" }, { status: 500 });
  }
  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" },
  );
  if (!r.ok) return Response.json({ error: `ElevenLabs: ${r.status} ${await r.text()}` }, { status: 502 });
  const { signed_url } = (await r.json()) as { signed_url: string };
  return Response.json({ signed_url });
}
```

## `app/AvatarAgent.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogLevel, SimliClient } from "simli-client";

type Status = "idle" | "starting" | "live" | "error";

const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

// AudioWorklet that converts mic Float32 frames into PCM16 and posts ~100 ms chunks.
// The AudioContext runs at 16 kHz, so the browser resamples the mic for us.
const MIC_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        this.buf[this.n++] = Math.round(s * 32767);
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

async function errorText(res: Response) {
  try {
    const j = await res.json();
    return j.error ?? JSON.stringify(j);
  } catch {
    return res.statusText;
  }
}

// Human-readable hints for common Simli failures (see the Simli troubleshooting table).
function explainSimliError(raw: string): string {
  const m = raw.toUpperCase();
  if (m.includes("401") || m.includes("UNAUTHORIZED")) return `${raw} — check SIMLI_API_KEY on the server.`;
  if (m.includes("INVALID_FACE_ID")) return `${raw} — the face ID doesn't exist; use a preset or copy it from the dashboard.`;
  if (m.includes("FACE_NOT_ALLOWED")) return `${raw} — that face belongs to another account.`;
  if (m.includes("422")) return `${raw} — invalid video framing (size/aspect/position).`;
  if (m.includes("429") || m.includes("RATE")) return `${raw} — too many concurrent Simli sessions; stop other sessions or upgrade.`;
  if (m.includes("TOO MANY RETRY")) return `${raw} — the browser can't reach Simli's media servers (firewall/VPN?).`;
  return raw;
}

export default function AvatarAgent() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simliRef = useRef<SimliClient | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);

  const cleanup = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    const mic = micRef.current;
    micRef.current = null;
    if (mic) {
      mic.stream.getTracks().forEach((t) => t.stop());
      void mic.ctx.close();
    }
    const simli = simliRef.current;
    simliRef.current = null;
    if (simli) void simli.stop();
    setSpeaking(false);
  }, []);

  const fail = useCallback(
    (msg: string) => {
      setError(msg);
      setStatus("error");
      cleanup();
    },
    [cleanup],
  );

  async function startMic(ws: WebSocket) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([MIC_WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    node.port.onmessage = (e: MessageEvent<Int16Array>) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const pcm = e.data;
      const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      ws.send(JSON.stringify({ user_audio_chunk: bytesToBase64(bytes) }));
    };
    ctx.createMediaStreamSource(stream).connect(node);
    micRef.current = { ctx, stream };
  }

  async function start() {
    // Runs from a click, so the browser allows audio playback.
    setError("");
    setStatus("starting");
    try {
      // 1. Simli first: the avatar must be ready before the agent says anything.
      const tokenRes = await fetch("/api/simli-token", { method: "POST" });
      if (!tokenRes.ok) throw new Error(explainSimliError(`Simli token route failed (${tokenRes.status}): ${await errorText(tokenRes)}`));
      const { session_token } = (await tokenRes.json()) as { session_token: string };

      const simli = new SimliClient(session_token, videoRef.current!, audioRef.current!, null, LogLevel.ERROR);
      simli.on("error", (detail) => fail(explainSimliError(`Simli error: ${detail}`)));
      simli.on("stop", () => {
        // Ended by maxSessionLength / maxIdleTime, or by us.
        if (simliRef.current === simli) {
          simliRef.current = null;
          cleanup();
          setStatus((s) => (s === "error" ? s : "idle"));
        }
      });
      simli.on("speaking", () => setSpeaking(true));
      simli.on("silent", () => setSpeaking(false));
      simli.on("destination", (info) => console.info("Simli destination (session id):", info));
      simliRef.current = simli;
      await simli.start(); // resolves when the first video frame is on screen

      // 2. Now the ElevenLabs agent. Its first message (greeting) arrives right after connecting.
      const urlRes = await fetch("/api/elevenlabs-signed-url", { method: "POST" });
      if (!urlRes.ok) throw new Error(`ElevenLabs signed URL failed (${urlRes.status}): ${await errorText(urlRes)}`);
      const { signed_url } = (await urlRes.json()) as { signed_url: string };

      const ws = new WebSocket(signed_url);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string);
        switch (msg.type) {
          case "conversation_initiation_metadata": {
            const fmt = msg.conversation_initiation_metadata_event?.agent_output_audio_format;
            if (fmt && fmt !== "pcm_16000") {
              fail(`ElevenLabs agent output format is "${fmt}". Set it to PCM 16000 Hz in the agent's voice settings.`);
            }
            break;
          }
          case "audio": {
            const b64 = msg.audio_event?.audio_base_64;
            if (b64) simliRef.current?.sendAudioData(base64ToBytes(b64));
            break;
          }
          case "interruption":
            simliRef.current?.ClearBuffer();
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong", event_id: msg.ping_event?.event_id }));
            break;
        }
      };
      ws.onerror = () => fail("ElevenLabs connection error.");
      ws.onclose = (ev) => {
        if (wsRef.current !== ws) return; // we closed it ourselves
        wsRef.current = null;
        // The conversation ended on the agent's side: end the Simli session too.
        cleanup();
        setStatus("idle");
        if (ev.code !== 1000 && ev.reason) setError(`ElevenLabs closed the conversation: ${ev.reason}`);
      };
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", () => reject(new Error("Could not connect to ElevenLabs.")), { once: true });
      });
      ws.send(JSON.stringify({ type: "conversation_initiation_client_data" }));

      // 3. Stream the microphone to the agent.
      await startMic(ws);
      setStatus("live");
    } catch (e) {
      fail(explainSimliError(e instanceof Error ? e.message : String(e)));
    }
  }

  function stop() {
    cleanup();
    setStatus("idle");
  }

  // Stop everything on unmount and when the tab is closed, so sessions don't keep billing.
  useEffect(() => {
    const onHide = () => cleanup();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      cleanup();
    };
  }, [cleanup]);

  return (
    <div>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#000", borderRadius: 12, overflow: "hidden" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {status === "starting" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>Connecting…</div>
        )}
      </div>
      {/* Simli's in-sync voice. The agent's original audio is never played. */}
      <audio ref={audioRef} autoPlay />
      <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        {status === "live" || status === "starting" ? (
          <button onClick={stop}>End</button>
        ) : (
          <button onClick={start}>Start</button>
        )}
        {status === "live" && <span>{speaking ? "Agent is speaking…" : "Listening…"}</span>}
      </div>
      {error && (
        <p role="alert" style={{ color: "#f88" }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

## `app/page.tsx`

```tsx
import AvatarAgent from "./AvatarAgent";

export default function Page() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20 }}>Talk to my agent</h1>
      <AvatarAgent />
    </main>
  );
}
```

Notes:

- The `<video>` is `muted` because the voice plays through the separate `<audio>` element, which is Simli's in-sync audio. Don't play the ElevenLabs audio anywhere else.
- Not handled here, but in the starter: clicking End while `simli.start()` is still pending (check a cancelled flag before opening the ElevenLabs socket), ElevenLabs `client_error` messages, and capturing the mic at the agent's reported `user_input_audio_format` rate with a fallback for Firefox (see [browser-js.md](browser-js.md#browser-quirks)).
- `pagehide` can't wait for the async `stop()` to finish. That's fine: Simli also ends the session when the connection drops, and `maxIdleTime` bounds it anyway.
- The ElevenLabs message shapes used here: `user_audio_chunk`, `audio_event.audio_base_64`, `interruption`, `ping_event.event_id` → `{type: "pong", event_id}`, and `conversation_initiation_metadata_event.agent_output_audio_format`. They match ElevenLabs' WebSocket API as of late 2026. If ElevenLabs changes them, follow its current docs.

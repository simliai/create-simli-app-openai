"use client";

import IconSparkleLoader from "@/media/IconSparkleLoader";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogLevel, SimliClient } from "simli-client";
import DottedFace from "./Components/DottedFace";
import VideoBox from "./Components/VideoBox";
import cn from "./utils/TailwindMergeAndClsx";
import { explainSimliError } from "./utils/simliErrors";

/**
 * OpenAI Realtime (WebRTC) speaking through a Simli avatar.
 *
 *   1. Microphone permission (echo cancellation on).
 *   2. Our server mints a Simli session token (POST /api/simli-token).
 *   3. Simli starts first; start() resolves when the avatar is on screen.
 *   4. Only then the OpenAI WebRTC call opens: the page posts its SDP offer to
 *      our server (POST /api/openai-session), which creates the call with the
 *      server-side key and config and returns the SDP answer. The model greets first.
 *      The model's audio track goes to Simli (listenToMediastreamTrack) and is
 *      never played directly: the user hears Simli's in-sync voice only.
 *   5. Ending either side (button, Simli time/idle limit, OpenAI hang-up,
 *      errors, unmount, pagehide) tears everything down.
 *
 * Docs: https://docs.simli.com/api-reference/javascript
 *       https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime
 */

type Status = "idle" | "starting" | "live";

interface SimliOpenAIProps {
  avatarName: string;
}

/** Reads `{ error }` from a failed response of our own API routes. */
async function routeError(res: Response, what: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(`${what} failed (${res.status}): ${body?.error ?? res.statusText}`);
}

type RealtimeServerEvent = { type: string; error?: { message?: string; code?: string } };

export default function SimliOpenAI({ avatarName }: SimliOpenAIProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);

  // Simli's video and in-sync audio.
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Muted sink for OpenAI's remote track. It is never heard; attaching the
  // remote stream to a media element keeps Chrome delivering its samples to
  // Web Audio, which is how simli-client reads the track.
  const openaiSinkRef = useRef<HTMLAudioElement>(null);

  const simliRef = useRef<SimliClient | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  // Bumped on every cleanup, so an in-flight start() can tell it was cancelled.
  const attemptRef = useRef(0);

  /** Idempotent: safe to call from any handler, any number of times. */
  const cleanup = useCallback(() => {
    attemptRef.current += 1;

    const dc = dcRef.current;
    dcRef.current = null;
    dc?.close();

    const pc = pcRef.current;
    pcRef.current = null;
    pc?.close();

    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;

    if (openaiSinkRef.current) openaiSinkRef.current.srcObject = null;

    const simli = simliRef.current;
    simliRef.current = null;
    // pagehide can't await this; Simli also ends the session when the connection drops.
    simli?.stop().catch(() => {});

    setSpeaking(false);
  }, []);

  /** End the whole conversation, optionally telling the user why. */
  const end = useCallback(
    (message?: string) => {
      cleanup();
      setStatus("idle");
      if (message) setError(message);
    },
    [cleanup],
  );

  const handleOpenAIEvent = useCallback((event: RealtimeServerEvent) => {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        // Barge-in: OpenAI stops its response; drop what Simli hasn't spoken yet.
        simliRef.current?.ClearBuffer();
        break;
      case "error":
        console.error("OpenAI Realtime error:", event.error);
        setError(`OpenAI: ${event.error?.message ?? event.error?.code ?? "unknown error"}`);
        break;
    }
  }, []);

  const start = useCallback(async () => {
    // Runs from a click, so the browser allows audio playback.
    cleanup();
    const attempt = attemptRef.current;
    const cancelled = () => attemptRef.current !== attempt;
    setError("");
    setStatus("starting");

    try {
      // 1. Microphone.
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (cancelled()) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      micRef.current = mic;

      // 2. Simli session token from our own server. No API key ever reaches the browser.
      const tokenRes = await fetch("/api/simli-token", { method: "POST" });
      if (!tokenRes.ok) throw await routeError(tokenRes, "Avatar session");
      const { session_token } = (await tokenRes.json()) as { session_token: string };
      if (cancelled()) return;

      // 3. Simli first: the avatar must be ready before the model says anything.
      const simli = new SimliClient(session_token, videoRef.current!, audioRef.current!, null, LogLevel.ERROR);
      simli.on("error", (detail) => {
        if (simliRef.current === simli) end(explainSimliError(`Simli error: ${detail}`));
      });
      simli.on("stop", () => {
        // Simli ended the session (maxSessionLength / maxIdleTime). Our own stop() clears simliRef first.
        if (simliRef.current === simli) end("The avatar session ended.");
      });
      simli.on("speaking", () => setSpeaking(true));
      simli.on("silent", () => setSpeaking(false));
      simli.on("destination", (info) => console.info("Simli session:", info));
      simliRef.current = simli;
      await simli.start(); // resolves when the first video frame is on screen
      if (cancelled()) return;

      // 4. OpenAI Realtime over WebRTC; our server creates the call (see app/api/openai-session).
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (pcRef.current !== pc || e.track.kind !== "audio") return;
        const sink = openaiSinkRef.current;
        if (sink) {
          sink.muted = true;
          sink.srcObject = e.streams[0] ?? new MediaStream([e.track]);
          sink.play().catch(() => {});
        }
        // Route the model's voice to the avatar; Simli plays it back in sync with the lips.
        simliRef.current?.listenToMediastreamTrack(e.track);
      };
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (pc.connectionState === "failed") end("Lost the connection to OpenAI.");
      };
      mic.getAudioTracks().forEach((track) => pc.addTrack(track, mic));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        // The model greets first (the greeting rule is in the server-side instructions).
        dc.send(JSON.stringify({ type: "response.create" }));
      };
      dc.onmessage = (e) => {
        try {
          handleOpenAIEvent(JSON.parse(e.data as string) as RealtimeServerEvent);
        } catch (err) {
          console.warn("Unreadable OpenAI event", err);
        }
      };
      dc.onclose = () => {
        // OpenAI hung up (session limit, server error). Our own close clears dcRef first.
        if (dcRef.current === dc) end("OpenAI ended the conversation.");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch("/api/openai-session", {
        method: "POST",
        body: offer.sdp,
        headers: { "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw await routeError(sdpRes, "Voice session");
      const answer = await sdpRes.text();
      if (cancelled()) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      if (cancelled()) return;

      setStatus("live");
    } catch (err) {
      if (cancelled()) return; // the user pressed stop, or the page went away
      console.error("Start failed:", err);
      const raw = err instanceof Error ? err.message : String(err);
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser and try again."
          : explainSimliError(raw);
      end(message);
    }
  }, [cleanup, end, handleOpenAIEvent]);

  // Stop everything on unmount and when the tab is closed, so sessions don't keep billing.
  useEffect(() => {
    const onHide = () => cleanup();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      cleanup();
    };
  }, [cleanup]);

  const showDottedFace = status === "idle";

  return (
    <div>
      {showDottedFace && <DottedFace />}
      <div className={cn("transition-all duration-300", showDottedFace ? "h-0 overflow-hidden" : "h-auto")}>
        <VideoBox video={videoRef} audio={audioRef} />
      </div>
      {/* OpenAI's original audio: muted, never heard (see openaiSinkRef). */}
      <audio ref={openaiSinkRef} muted autoPlay hidden />

      <div className="flex flex-col items-center">
        {status === "idle" ? (
          <button
            onClick={start}
            className={cn(
              "w-full h-[52px] mt-4 bg-simliblue text-white py-3 px-6 rounded-[100px] transition-all duration-300 hover:text-black hover:bg-white hover:rounded-xs",
              "flex justify-center items-center",
            )}
          >
            <span className="font-abc-repro-mono font-bold w-[164px]">Test Interaction</span>
          </button>
        ) : (
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={() => end()}
              className="mt-4 group text-white flex-grow bg-red hover:rounded-xs hover:bg-white h-[52px] px-6 rounded-[100px] transition-all duration-300 flex justify-center items-center"
            >
              {status === "starting" ? (
                <IconSparkleLoader className="h-[20px] w-auto animate-loader group-hover:invert" />
              ) : (
                <span className="font-abc-repro-mono group-hover:text-black font-bold w-[164px] transition-all duration-300">
                  Stop Interaction
                </span>
              )}
            </button>
          </div>
        )}
        {status === "live" && (
          <p className="mt-3 font-abc-repro-mono text-xs text-gray-400" aria-live="polite">
            {speaking ? `${avatarName} is speaking…` : "Listening…"}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 max-w-[350px] text-center text-red">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

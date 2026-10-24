"use client";

import { useEffect, useRef, useState } from "react";
import type { SimliClient } from "simli-client";
import { startSimli } from "@/lib/simli";
import AvatarStage, { type Status } from "./AvatarStage";

// OpenAI Realtime listens and speaks over WebRTC; its voice is sent to Simli,
// which plays it back in sync with the avatar's lips.
export default function OpenAIAvatar({ name }: { name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simli = useRef<SimliClient | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const run = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");

  function stop() {
    run.current++;
    peer.current?.close();
    peer.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    simli.current?.stop();
    simli.current = null;
    setCaption("");
  }

  useEffect(() => stop, []);

  async function start() {
    const id = ++run.current;
    const cancelled = () => id !== run.current;
    setError("");
    setStatus("connecting");
    try {
      // 1. The avatar. handleSilence is off because we stream a live audio track into it.
      const client = await startSimli(videoRef.current!, audioRef.current!, { handleSilence: false });
      if (cancelled()) return client.stop();
      simli.current = client;
      client.on("stop", () => { if (!cancelled()) { stop(); setStatus("idle"); } });

      // 2. The microphone.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (cancelled()) return stream.getTracks().forEach((t) => t.stop());
      mic.current = stream;

      // 3. OpenAI Realtime over WebRTC, with a short-lived key from our server.
      const res = await fetch("/api/openai-token", { method: "POST" });
      const token = await res.json();
      if (!res.ok) throw new Error(token.error);

      const pc = new RTCPeerConnection();
      peer.current = pc;
      pc.addTrack(stream.getAudioTracks()[0], stream);
      pc.ontrack = (e) => {
        // Chrome only lets a remote track's audio flow once it's attached to a media element;
        // muted, because Simli plays the voice in sync with the video.
        const sink = new Audio();
        sink.muted = true;
        sink.srcObject = e.streams[0];
        client.listenToMediastreamTrack(e.track);
      };

      const events = pc.createDataChannel("oai-events");
      events.onopen = () => events.send(JSON.stringify({ type: "response.create" })); // the avatar speaks first
      events.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "input_audio_buffer.speech_started") {
          client.ClearBuffer(); // the user interrupted: stop talking right away
          setCaption("");
        } else if (event.type === "response.created") {
          setCaption("");
        } else if (event.type === "response.output_audio_transcript.delta") {
          setCaption((c) => c + event.delta);
        } else if (event.type === "error") {
          console.error("OpenAI:", event.error);
          setError(`OpenAI: ${event.error?.message ?? "unknown error"}`);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token.key}`, "Content-Type": "application/sdp" },
      });
      if (!answer.ok) throw new Error(`OpenAI didn't accept the call (${answer.status}): ${await answer.text()}`);
      if (cancelled()) return;
      await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      setStatus("live");
    } catch (e) {
      if (cancelled()) return;
      stop();
      setStatus("error");
      const message = e instanceof Error ? e.message : String(e);
      setError(message.includes("Permission") || message.includes("NotAllowed")
        ? "The browser blocked the microphone. Allow it for this page and try again."
        : message);
    }
  }

  return (
    <AvatarStage
      name={name}
      status={status}
      error={error}
      caption={caption}
      videoRef={videoRef}
      audioRef={audioRef}
      onStart={start}
      onStop={() => { stop(); setStatus("idle"); }}
    />
  );
}

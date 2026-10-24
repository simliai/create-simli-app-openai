"use client";

import { useEffect, useRef, useState } from "react";
import type { SimliClient } from "simli-client";
import { startSimli } from "@/lib/simli";
import AvatarStage, { type Status } from "./AvatarStage";

// OpenAI's GPT-Live listens and speaks over WebRTC; its voice is sent to Simli,
// which plays it back in sync with the avatar's lips.
export default function OpenAIAvatar({ name }: { name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simli = useRef<SimliClient | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const run = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");

  function stop() {
    run.current++;
    // Ask GPT-Live to end the session (so usage is final), then hang up.
    const pc = peer.current, ch = channel.current;
    if (ch?.readyState === "open") ch.send(JSON.stringify({ type: "session.close" }));
    setTimeout(() => pc?.close(), 500);
    peer.current = null;
    channel.current = null;
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

      // 3. GPT-Live over WebRTC. Our server creates the session for this offer.
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

      let firstMessage = "";
      let lastSpoke = 0; // a new caption starts when Kate speaks again after a pause
      const events = pc.createDataChannel("oai-events");
      channel.current = events;
      events.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "session.started") {
          setStatus("live");
          // GPT-Live waits for the user by default, so ask it to say hello first.
          events.send(JSON.stringify({
            type: "session.instructions.append",
            delegation_id: null,
            content: `Greet the user now by saying: "${firstMessage}"`,
          }));
        } else if (event.type === "session.output_transcript.delta") {
          const newTurn = Date.now() - lastSpoke > 1500;
          lastSpoke = Date.now();
          setCaption((c) => (newTurn ? event.delta.trimStart() : c + event.delta));
        } else if (event.type === "session.closed") {
          if (!cancelled()) { stop(); setStatus("idle"); }
        } else if (event.type === "error") {
          console.error("OpenAI:", event.error);
          setError(`OpenAI: ${event.error?.message ?? "unknown error"}`);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Send the offer once it lists every network route.
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && resolve());
        setTimeout(resolve, 2000);
      });
      const res = await fetch("/api/openai-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: pc.localDescription!.sdp }),
      });
      const answer = await res.json();
      if (!res.ok) throw new Error(answer.error);
      if (cancelled()) return;
      firstMessage = answer.firstMessage;
      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
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

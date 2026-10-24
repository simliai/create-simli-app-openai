"use client";

import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import AvatarStage, { type Status } from "./AvatarStage";

// Joins a LiveKit room with your microphone. The agent (agent/agent.py) joins too and talks
// through GPT-Live; Simli publishes the avatar's video and voice, which we show here.
export default function LiveKitAvatar({ name }: { name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const room = useRef<Room | null>(null);
  const run = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");

  function stop() {
    run.current++;
    room.current?.disconnect();
    room.current = null;
    setCaption("");
  }

  useEffect(() => stop, []);

  function fail(message: string) {
    stop();
    setStatus("error");
    setError(message);
  }

  async function start() {
    const id = ++run.current;
    const cancelled = () => id !== run.current;
    setError("");
    setStatus("connecting");
    try {
      const res = await fetch("/api/token", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      if (cancelled()) return;

      const r = new Room({ adaptiveStream: false });
      room.current = r;
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          setStatus("live");
        } else if (track.kind === Track.Kind.Audio && audioRef.current) {
          track.attach(audioRef.current);
        }
      });
      r.on(RoomEvent.Disconnected, () => {
        if (!cancelled()) { stop(); setStatus("idle"); }
      });
      // The agent's words, as it speaks them, for captions.
      r.registerTextStreamHandler("lk.transcription", async (reader, from) => {
        if (from.identity === r.localParticipant.identity) return; // our own words
        setCaption("");
        for await (const chunk of reader) setCaption((c) => c + chunk);
      });

      await r.connect(body.url, body.token);
      if (cancelled()) return r.disconnect();
      await r.localParticipant.setMicrophoneEnabled(true);
      // The agent joins within a second or two; the avatar's video follows.
      setTimeout(() => {
        if (!cancelled() && r.remoteParticipants.size === 0) {
          fail("No agent joined the room. Is it running? Start it with: cd agent && uv run agent.py dev");
        }
      }, 15000);
    } catch (e) {
      if (cancelled()) return;
      const message = e instanceof Error ? e.message : String(e);
      fail(message.includes("Permission") || message.includes("NotAllowed")
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

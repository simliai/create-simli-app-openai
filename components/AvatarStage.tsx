import type { RefObject } from "react";

export type Status = "idle" | "connecting" | "live" | "error";

// The video, the start/stop button and what's happening. No logic, so it's easy to restyle.
export default function AvatarStage(props: {
  name: string;
  status: Status;
  error: string;
  caption: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  onStart: () => void;
  onStop: () => void;
}) {
  const { name, status, error, caption, videoRef, audioRef, onStart, onStop } = props;
  const busy = status === "connecting";
  const live = status === "live";
  return (
    <section className="stage">
      <div className="screen" data-live={live}>
        <video ref={videoRef} autoPlay playsInline />
        <audio ref={audioRef} autoPlay />
        {!live && <p className="screen-note">{busy ? `Connecting to ${name}…` : `Talk to ${name}`}</p>}
        {live && caption && <p className="caption">{caption}</p>}
      </div>
      {live || busy ? (
        <button className="button stop" onClick={onStop}>{busy ? "Cancel" : "End conversation"}</button>
      ) : (
        <button className="button" onClick={onStart}>Start conversation</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {live && <p className="hint">Speak into your microphone. You can interrupt at any time.</p>}
    </section>
  );
}

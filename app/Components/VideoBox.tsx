import type { RefObject } from "react";

interface Props {
  video: RefObject<HTMLVideoElement | null>;
  audio: RefObject<HTMLAudioElement | null>;
}

/**
 * The Simli avatar: video plus Simli's in-sync voice.
 * 16:9 player for the Simli stream (the token route requests 1366x768).
 * For a square layout, request 768x768 in app/api/simli-token/route.ts and use aspect-square here.
 */
export default function VideoBox({ video, audio }: Props) {
  return (
    <div className="aspect-video w-full flex items-center justify-center overflow-hidden rounded-sm bg-simligray">
      {/* muted: the voice plays through the <audio> below, which is Simli's in-sync audio */}
      <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
      <audio ref={audio} autoPlay />
    </div>
  );
}

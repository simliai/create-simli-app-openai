import type { RefObject } from "react";

interface Props {
  video: RefObject<HTMLVideoElement | null>;
  audio: RefObject<HTMLAudioElement | null>;
}

/**
 * The Simli avatar: video plus Simli's in-sync voice.
 * The stream is 768x768 (see app/api/simli-token), so the box is square too.
 */
export default function VideoBox({ video, audio }: Props) {
  return (
    <div className="flex aspect-square w-[350px] max-w-full items-center justify-center overflow-hidden rounded-xs bg-simligray">
      {/* muted: the voice plays through the <audio> below, which is Simli's in-sync audio */}
      <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
      <audio ref={audio} autoPlay />
    </div>
  );
}

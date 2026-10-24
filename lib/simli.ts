import { LogLevel, SimliClient } from "simli-client";

// Starts a Simli avatar in the given video and audio elements.
// The session token comes from /api/simli-token, so the API key stays on the server.
export async function startSimli(
  video: HTMLVideoElement,
  audio: HTMLAudioElement,
  options: { handleSilence?: boolean } = {},
): Promise<SimliClient> {
  const res = await fetch("/api/simli-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Couldn't get a Simli session token (${res.status})`);
  body.warnings?.forEach((w: string) => console.warn("Simli:", w));

  const client = new SimliClient(body.session_token, video, audio, null, LogLevel.ERROR, "livekit");
  // A startup error (an unknown face, no minutes left...) won't fix itself, so stop retrying and say why.
  const startupError = new Promise<never>((_, reject) =>
    client.on("startup_error", (message) => {
      client.stop();
      reject(new Error(`Simli couldn't start the avatar: ${message}`));
    }),
  );
  const started = client.start();
  started.catch(() => {});
  await Promise.race([started, startupError]);
  return client;
}

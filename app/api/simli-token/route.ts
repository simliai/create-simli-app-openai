import { generateSimliSessionToken } from "simli-client";
import { ConfigError, noStoreJson, requireEnv, simliFaceId } from "@/lib/server-env";

/**
 * POST /api/simli-token -> { session_token }
 *
 * Mints a short-lived Simli session token. SIMLI_API_KEY never leaves the server.
 *
 * TODO before deploying: protect this route with your app's auth and/or rate
 * limiting. Anyone who can call it can start avatar sessions billed to your
 * Simli account. See "Before you deploy" in README.md.
 */
export async function POST() {
  let apiKey: string;
  let faceId: string;
  try {
    apiKey = requireEnv("SIMLI_API_KEY");
    faceId = simliFaceId();
  } catch (err) {
    if (err instanceof ConfigError) return noStoreJson({ error: err.message }, 500);
    throw err;
  }

  try {
    const { session_token, warnings } = await generateSimliSessionToken({
      apiKey,
      config: {
        faceId,
        // Bound every session so a forgotten tab can't bill for long.
        maxSessionLength: 600, // seconds
        maxIdleTime: 180, // seconds without audio
        // The OpenAI voice arrives as a live WebRTC track (listenToMediastreamTrack),
        // which already contains its own silence, so Simli must not add gap filling.
        handleSilence: false,
        // Square video, matching the square avatar box in the UI (aspect-ratio 1 / 1).
        // For a 16:9 layout use 1366x768 and change the box's aspect ratio to match.
        streaming_width: 768,
        streaming_height: 768,
      },
    });
    if (warnings?.length) console.warn("Simli token warnings:", warnings);
    return noStoreJson({ session_token });
  } catch (err) {
    // generateSimliSessionToken throws the Simli API's error text (it never contains the key).
    console.error("Simli token error:", err);
    return noStoreJson({ error: `Simli: ${String(err)}` }, 502);
  }
}

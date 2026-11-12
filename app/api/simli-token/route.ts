import {
  SESSION_MAX_SECONDS,
  SIMLI_MAX_IDLE_SECONDS,
  UPSTREAM_TIMEOUT_MS,
  configErrorResponse,
  errorResponse,
  noStoreJson,
  rejectUnlessSessionsAllowed,
  requireEnv,
  simliFaceId,
} from "@/lib/server-env";

/**
 * POST /api/simli-token -> { session_token }
 *
 * Mints a short-lived Simli session token. SIMLI_API_KEY never leaves the server.
 * Calls Simli's REST endpoint directly (same as generateSimliSessionToken from
 * simli-client) so the request can have a timeout.
 * Docs: https://docs.simli.com/api-reference/javascript
 */
export async function POST() {
  // TODO before deploying: check the user's session / rate limit here (see README "Before you deploy").
  const refused = rejectUnlessSessionsAllowed();
  if (refused) return refused;

  let apiKey: string;
  let faceId: string;
  try {
    apiKey = requireEnv("SIMLI_API_KEY");
    faceId = simliFaceId();
  } catch (err) {
    return configErrorResponse(err);
  }

  const config = {
    faceId,
    // Hard caps enforced by Simli: a forgotten tab can't bill for long.
    maxSessionLength: SESSION_MAX_SECONDS,
    // Seconds without audio. Note: a continuous WebRTC track carries silence
    // frames, so this may never fire while the OpenAI call is connected.
    maxIdleTime: SIMLI_MAX_IDLE_SECONDS,
    // The OpenAI voice arrives as a live WebRTC track (listenToMediastreamTrack),
    // which already contains its own silence, so Simli must not add gap filling.
    handleSilence: false,
    // Square video, matching the square avatar box in the UI (aspect-ratio 1 / 1).
    // For a 16:9 layout use 1366x768 and change the box's aspect ratio to match.
    streaming_width: 768,
    streaming_height: 768,
  };

  let res: Response;
  try {
    res = await fetch("https://api.simli.ai/compose/token", {
      method: "POST",
      headers: { "x-simli-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(config),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("Simli token request failed:", err);
    return errorResponse(502, "Could not start the avatar session.", "The server could not reach Simli.");
  }

  const text = await res.text().catch(() => "");
  let data: { session_token?: string; warnings?: string[] } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!res.ok || !data?.session_token) {
    // Simli's error body (e.g. INVALID_FACE_ID, 401) goes to the log; only shown to the browser in development.
    console.error("Simli token error:", res.status, text.slice(0, 500));
    return errorResponse(502, "Could not start the avatar session.", `Simli (${res.status}): ${text.slice(0, 300)}`);
  }

  if (data.warnings?.length) console.warn("Simli token warnings:", data.warnings);
  return noStoreJson({ session_token: data.session_token });
}

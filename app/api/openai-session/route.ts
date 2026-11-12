import { avatar } from "@/app/avatar";
import {
  SESSION_MAX_SECONDS,
  UPSTREAM_TIMEOUT_MS,
  configErrorResponse,
  errorResponse,
  rejectUnlessSessionsAllowed,
  requireEnv,
} from "@/lib/server-env";

/**
 * POST /api/openai-session  (body: the browser's SDP offer, Content-Type application/sdp)
 *   -> the SDP answer (Content-Type application/sdp)
 *
 * OpenAI's "unified interface" for WebRTC: the server sends the browser's SDP
 * offer plus the session config (model, voice, instructions) to
 * POST https://api.openai.com/v1/realtime/calls with OPENAI_API_KEY, and returns
 * OpenAI's SDP answer. No OpenAI credential of any kind reaches the browser.
 *
 * The call is capped on the server: OpenAI returns the call ID in the Location
 * header, and this route hangs the call up (POST /v1/realtime/calls/{id}/hangup)
 * after SESSION_MAX_SECONDS, even if the browser never ends it.
 * Limitation: the timer lives in this server process. It works with `next start`
 * or any long-running Node server, but NOT reliably on serverless platforms,
 * which may freeze or recycle the function after the response. See README
 * "Before you deploy" for what to use there.
 *
 * Docs: https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime
 *       https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create
 *       https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup
 */

export const runtime = "nodejs";

const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const MAX_SDP_BYTES = 64 * 1024;
const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/;
// A few seconds after Simli's own maxSessionLength, so the page normally ends first.
const HANGUP_AFTER_MS = (SESSION_MAX_SECONDS + 15) * 1000;

function scheduleHangup(callId: string, apiKey: string) {
  const timer = setTimeout(async () => {
    try {
      const res = await fetch(`${OPENAI_CALLS_URL}/${encodeURIComponent(callId)}/hangup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      // A call that already ended is fine; log anything else.
      if (res.ok) console.info(`OpenAI call ${callId} hung up after the ${SESSION_MAX_SECONDS} s cap.`);
      else if (res.status !== 404) console.warn(`OpenAI hangup for ${callId} returned ${res.status}.`);
    } catch (err) {
      console.error(`OpenAI hangup for ${callId} failed:`, err);
    }
  }, HANGUP_AFTER_MS);
  // Don't keep the process alive just for this timer.
  timer.unref?.();
}

export async function POST(request: Request) {
  // TODO before deploying: check the user's session / rate limit here (see README "Before you deploy").
  const refused = rejectUnlessSessionsAllowed();
  if (refused) return refused;

  let apiKey: string;
  try {
    apiKey = requireEnv("OPENAI_API_KEY");
  } catch (err) {
    return configErrorResponse(err);
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_SDP_BYTES) {
    return errorResponse(413, "SDP offer is too large.");
  }
  const offer = await request.text().catch(() => "");
  if (offer.length > MAX_SDP_BYTES || !offer.startsWith("v=0")) {
    return errorResponse(400, "Expected a WebRTC SDP offer.");
  }

  // Bound on the server: the browser only sends its SDP offer.
  const session = {
    type: "realtime",
    model: avatar.openai_model,
    instructions: avatar.initialPrompt,
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        // The model stops talking when the user starts (barge-in); the page
        // also clears Simli's buffer on input_audio_buffer.speech_started.
        turn_detection: { type: "semantic_vad", interrupt_response: true, create_response: true },
      },
      output: { voice: avatar.openai_voice },
    },
  };

  const form = new FormData();
  form.set("sdp", offer);
  form.set("session", JSON.stringify(session));

  let res: Response;
  try {
    res = await fetch(OPENAI_CALLS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // If you have signed-in users, send a stable hashed user ID:
        // "OpenAI-Safety-Identifier": hashedUserId,
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("OpenAI realtime/calls request failed:", err);
    return errorResponse(502, "Could not start the voice session.", "The server could not reach OpenAI.");
  }

  const answer = await res.text().catch(() => "");

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const parsed = JSON.parse(answer) as { error?: { message?: string; code?: string } };
      detail = parsed.error?.message ?? parsed.error?.code ?? detail;
    } catch {
      // not JSON
    }
    console.error("OpenAI realtime/calls error:", res.status, detail);
    // OpenAI's 401 message echoes part of the key: never forward it, even in development.
    const devDetail = res.status === 401 ? "OPENAI_API_KEY was rejected." : `OpenAI (${res.status}): ${detail}`;
    return errorResponse(502, "Could not start the voice session.", devDetail);
  }

  // Location: /v1/realtime/calls/{call_id}. Without it the cap can't be enforced, so fail closed.
  const callId = res.headers.get("location")?.split("/").pop() ?? "";
  if (!CALL_ID.test(callId) || !answer.startsWith("v=0")) {
    console.error("OpenAI realtime/calls returned no usable call ID or SDP answer; refusing the call.");
    return errorResponse(502, "Could not start the voice session.");
  }
  scheduleHangup(callId, apiKey);

  return new Response(answer, {
    status: 200,
    headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" },
  });
}

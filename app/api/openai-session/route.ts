import { avatar } from "@/app/avatar";
import { ConfigError, noStoreJson, requireEnv } from "@/lib/server-env";

/**
 * POST /api/openai-session -> { client_secret, expires_at }
 *
 * Mints an ephemeral OpenAI Realtime client secret (`ek_...`) with the session
 * configuration (model, voice, instructions, turn detection) bound on the
 * server. The browser only gets the ephemeral secret and uses it once to open
 * a WebRTC call at https://api.openai.com/v1/realtime/calls.
 * OPENAI_API_KEY never leaves the server.
 *
 * Docs: https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime
 *       https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create
 *
 * TODO before deploying: protect this route with your app's auth and/or rate
 * limiting. Anyone who can call it can start Realtime sessions billed to your
 * OpenAI account. If you have signed-in users, also send a hashed user ID as
 * the `OpenAI-Safety-Identifier` header below. See "Before you deploy" in README.md.
 */
export async function POST() {
  let apiKey: string;
  try {
    apiKey = requireEnv("OPENAI_API_KEY");
  } catch (err) {
    if (err instanceof ConfigError) return noStoreJson({ error: err.message }, 500);
    throw err;
  }

  const body = {
    // How long the browser has to open the call with this secret (not the call length).
    expires_after: { anchor: "created_at", seconds: 120 },
    session: {
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
    },
  };

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // "OpenAI-Safety-Identifier": hashedUserId,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    console.error("OpenAI client_secrets request failed:", err);
    return noStoreJson({ error: "Could not reach the OpenAI API from the server." }, 502);
  }

  const data = (await res.json().catch(() => null)) as {
    value?: string;
    expires_at?: number;
    error?: { message?: string; type?: string; code?: string };
  } | null;

  if (!res.ok || !data?.value) {
    console.error("OpenAI client_secrets error:", res.status, data?.error);
    // Don't forward OpenAI's message for auth errors: it echoes part of the key.
    const detail =
      res.status === 401
        ? "OPENAI_API_KEY was rejected. Check the key in .env.local."
        : (data?.error?.message ?? data?.error?.code ?? res.statusText);
    return noStoreJson({ error: `OpenAI (${res.status}): ${detail}` }, 502);
  }

  return noStoreJson({ client_secret: data.value, expires_at: data.expires_at });
}

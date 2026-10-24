import { avatar } from "@/app/config";

// Mints a Simli session token on the server, so the API key never reaches the browser.
export async function POST(req: Request) {
  const apiKey = process.env.SIMLI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "SIMLI_API_KEY is missing. Add it to .env.local (see .env.example) and restart." }, { status: 500 });
  }
  const { handleSilence = true } = await req.json().catch(() => ({}));

  const res = await fetch("https://api.simli.ai/compose/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-simli-api-key": apiKey },
    body: JSON.stringify({
      faceId: avatar.faceId,
      handleSilence,
      maxSessionLength: avatar.maxSessionSeconds,
      maxIdleTime: 120,
      streaming_width: avatar.width,
      streaming_height: avatar.height,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: `Simli didn't start a session (${res.status}): ${detail}` }, { status: 502 });
  }
  const { session_token, warnings } = await res.json();
  return Response.json({ session_token, warnings });
}

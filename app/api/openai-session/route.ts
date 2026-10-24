import { agent } from "@/app/config";

// Starts a GPT-Live session for the browser's WebRTC offer and returns OpenAI's answer.
// The session is created here, so your OpenAI API key never reaches the browser.
export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is missing. Add it to .env.local (see .env.example) and restart." }, { status: 500 });
  }
  const { sdp } = await req.json();

  const res = await fetch("https://api.openai.com/v1/live/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      session: {
        model: agent.model,
        instructions: agent.instructions,
        audio: { output: { voice: agent.voice } },
      },
      transport: { type: "webrtc", sdp },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.transport?.sdp) {
    return Response.json({ error: `OpenAI didn't start a session (${res.status}): ${data?.error?.message ?? JSON.stringify(data)}` }, { status: 502 });
  }
  return Response.json({ sdp: data.transport.sdp, firstMessage: agent.firstMessage });
}

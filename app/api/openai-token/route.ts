import { agent } from "@/app/config";

// Mints a short-lived OpenAI Realtime key, so the browser can connect without your API key.
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is missing. Add it to .env.local (see .env.example) and restart." }, { status: 500 });
  }

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: agent.model,
        instructions: agent.instructions,
        audio: { output: { voice: agent.voice } },
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: `OpenAI didn't start a session (${res.status}): ${detail}` }, { status: 502 });
  }
  const { value } = await res.json();
  return Response.json({ key: value, model: agent.model });
}

import { AccessToken } from "livekit-server-sdk";

// Gives the browser a token for a fresh LiveKit room. The agent (agent/agent.py) joins every
// new room in your project, so starting a room is all it takes to start a conversation.
export async function POST() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return Response.json({ error: "LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET is missing. Add them to .env.local (see .env.example) and restart." }, { status: 500 });
  }
  const id = crypto.randomUUID().slice(0, 8);
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: `user-${id}`, ttl: "15m" });
  token.addGrant({ room: `simli-${id}`, roomJoin: true, canPublish: true, canSubscribe: true });
  return Response.json({ url: LIVEKIT_URL, token: await token.toJwt() });
}

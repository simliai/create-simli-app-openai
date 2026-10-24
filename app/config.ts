// Everything you'd want to change about the avatar lives here.

export const avatar = {
  name: "Kate",
  // Any Trinity-2 face: one of the presets at https://docs.simli.com/api-reference/preset-faces,
  // or your own from https://app.simli.com. SIMLI_FACE_ID in .env.local overrides it.
  faceId: process.env.SIMLI_FACE_ID || "c060fe44-9b14-43e8-b92c-83a0e230db11",
  // The video's size. Trinity-2 takes 1:1, 16:9 or 9:16, at least 512 pixels a side.
  width: 1366,
  height: 768,
  // Sessions end after this many seconds, so a forgotten tab doesn't use up your minutes.
  maxSessionSeconds: 600,
};

export const agent = {
  // Speech-to-speech model. "gpt-realtime-2.1-mini" is cheaper.
  model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
  voice: "marin",
  instructions: `You are Kate, a friendly assistant shown as a real-time video avatar made with Simli.
Greet the user in one short sentence and ask what they'd like to talk about.
Keep every answer short and conversational: one to three sentences, no lists or markdown.`,
};

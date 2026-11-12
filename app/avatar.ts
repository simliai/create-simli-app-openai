import "server-only";

/**
 * Customize your avatar here.
 *
 * This file is server-only: the API routes read it when they mint session
 * tokens, so the browser can't change the prompt, voice or model. Only `name`
 * is passed to the page for display.
 *
 * The avatar's face is set with SIMLI_FACE_ID in .env.local (default: the
 * Trinity-2 preset "Anna"). If you change the face, change name/voice to match.
 */
export const avatar = {
  name: "Anna",

  // OpenAI Realtime model. "gpt-realtime-2.1-mini" is cheaper and faster.
  openai_model: "gpt-realtime-2.1",

  // Built-in voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar.
  // OpenAI recommends marin and cedar for best quality.
  openai_voice: "marin",

  initialPrompt:
    "You are a helpful AI assistant named Anna, shown to the user as a video avatar. " +
    "You are friendly and concise. Your answers are short and to the point: this is a spoken conversation, " +
    "so never use lists, markdown or long explanations. " +
    "When the conversation starts, greet the user in one short sentence and ask how you can help.",
} as const;

export type AvatarConfig = typeof avatar;

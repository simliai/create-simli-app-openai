# Simli + OpenAI GPT-Live

A real-time video avatar you can talk to. OpenAI's GPT-Live listens and answers by voice, and [Simli](https://www.simli.com) turns that voice into a lip-synced Trinity-2 avatar, live.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsimliai%2Fcreate-simli-app-openai&env=SIMLI_API_KEY,OPENAI_API_KEY&envDescription=Your%20Simli%20and%20OpenAI%20API%20keys&envLink=https%3A%2F%2Fgithub.com%2Fsimliai%2Fcreate-simli-app-openai%23setup&project-name=simli-openai-avatar)

## Setup

You need Node.js 20 or newer, a [Simli API key](https://app.simli.com) (free plan included) and an [OpenAI API key](https://platform.openai.com/api-keys).

```bash
git clone https://github.com/simliai/create-simli-app-openai
cd create-simli-app-openai
npm install
cp .env.example .env.local   # then paste in your two keys
npm run dev
```

Open http://localhost:3000, press **Start conversation** and allow the microphone.

## Make it yours

Everything is in [`app/config.ts`](app/config.ts):

- **Face:** any Trinity-2 face ID. Pick a [preset](https://docs.simli.com/api-reference/preset-faces) or [make your own from a photo](https://app.simli.com).
- **Video size:** 16:9 by default; 1:1 and 9:16 work too.
- **Voice, greeting and prompt:** any of GPT-Live's voices (the list is in the file).

## How it works

1. The browser gets a Simli session token from the server (`app/api/simli-token`), and the server starts the GPT-Live session for the browser's WebRTC offer (`app/api/openai-session`). Your API keys never leave the server.
2. Simli starts the avatar video in the page ([`lib/simli.ts`](lib/simli.ts)).
3. The browser connects to GPT-Live over WebRTC and sends your microphone ([`components/OpenAIAvatar.tsx`](components/OpenAIAvatar.tsx)).
4. GPT-Live's voice goes into Simli, which plays it in sync with the avatar's lips. GPT-Live listens while it talks, so you can interrupt it like a person.

## Before you go to production

The token routes are open to anyone who can reach your site, so each visit can use your Simli minutes and OpenAI credit. Put them behind your own sign-in or rate limiting. `maxSessionSeconds` in `app/config.ts` caps each session.

## More

- [Simli docs](https://docs.simli.com) and [all starters](https://docs.simli.com/api-reference/samples/all-samples)
- Questions? Ask on [Discord](https://discord.gg/yQx49zNF4d).

import OpenAIAvatar from "@/components/OpenAIAvatar";
import { avatar } from "./config";

export default function Home() {
  return (
    <main>
      <header>
        <h1>Simli + OpenAI GPT-Live</h1>
        <p>A real-time video avatar on Trinity-2. Change the face, voice and prompt in <code>app/config.ts</code>.</p>
      </header>
      <OpenAIAvatar name={avatar.name} />
      <footer>
        <a href="https://docs.simli.com">Docs</a>
        <a href="https://app.simli.com">Create your own avatar</a>
        <a href="https://github.com/simliai/create-simli-app-openai">GitHub</a>
      </footer>
    </main>
  );
}

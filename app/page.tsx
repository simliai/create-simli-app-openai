import LiveKitAvatar from "@/components/LiveKitAvatar";

export default function Home() {
  return (
    <main>
      <header>
        <h1>Simli + OpenAI GPT-Live on LiveKit</h1>
        <p>A LiveKit voice agent that talks through OpenAI&apos;s GPT-Live, with a Simli Trinity-2 avatar as its face. Change the face, voice and prompt in <code>agent/agent.py</code>.</p>
      </header>
      <LiveKitAvatar name="Kate" />
      <footer>
        <a href="https://docs.simli.com">Docs</a>
        <a href="https://app.simli.com">Create your own avatar</a>
        <a href="https://github.com/simliai/create-simli-app-openai">GitHub</a>
      </footer>
    </main>
  );
}

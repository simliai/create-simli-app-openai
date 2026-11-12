import { avatar } from "./avatar";
import SimliHeaderLogo from "./Components/Logo";
import SimliOpenAI from "./SimliOpenAI";

const REPO_URL = "https://github.com/simliai/create-simli-app-openai";

const links = [
  { href: "https://docs.simli.com", label: "Docs" },
  { href: "https://discord.gg/yQx49zNF4d", label: "Discord" },
  { href: REPO_URL, label: "GitHub" },
];

// The avatar (name, prompt, voice, model) is configured in app/avatar.ts, and the
// face in SIMLI_FACE_ID. Both are read on the server; only the name reaches the page.
export default function Demo() {
  return (
    <div className="bg-black min-h-screen flex flex-col font-abc-repro font-normal text-sm text-white">
      <header className="w-full max-w-[1100px] mx-auto flex items-center justify-between px-6 py-6">
        <SimliHeaderLogo />
        <nav className="flex items-center gap-6 text-gray-300">
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="flex-1 w-full max-w-[1100px] mx-auto flex flex-col items-center px-6 pb-12">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold leading-tight">Talk to OpenAI Realtime</h1>
          <p className="text-gray-400 mt-2">A real-time Simli avatar speaks the model&apos;s replies.</p>
        </div>

        <div className="w-full max-w-[960px]">
          <SimliOpenAI avatarName={avatar.name} />
        </div>

        <section className="w-full max-w-[960px] mt-12 rounded-lg border border-white/10 p-6 text-gray-300">
          <h2 className="text-white font-bold mb-4">Run it yourself</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            <li>
              <span className="block text-white mb-1">1. Add your keys</span>
              Copy <code className="font-abc-repro-mono text-xs">.env.example</code> to{" "}
              <code className="font-abc-repro-mono text-xs">.env.local</code> and add your Simli and OpenAI API keys.
            </li>
            <li>
              <span className="block text-white mb-1">2. Start it</span>
              Run <code className="font-abc-repro-mono text-xs">npm install</code> and{" "}
              <code className="font-abc-repro-mono text-xs">npm run dev</code>, then open this page.
            </li>
            <li>
              <span className="block text-white mb-1">3. Make it yours</span>
              Change <code className="font-abc-repro-mono text-xs">SIMLI_FACE_ID</code> for another avatar, and the
              prompt, voice and model in <code className="font-abc-repro-mono text-xs">app/avatar.ts</code>.
            </li>
          </ol>
          <p className="mt-6 text-xs text-gray-500">
            Before deploying, put the session routes behind your own sign-in. See the{" "}
            <a
              href={`${REPO_URL}#before-you-deploy`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              README
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}

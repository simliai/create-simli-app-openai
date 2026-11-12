import Image from "next/image";
import GitHubLogo from "@/media/github-mark-white.svg";
import { avatar } from "./avatar";
import SimliHeaderLogo from "./Components/Logo";
import Navbar from "./Components/Navbar";
import SimliOpenAI from "./SimliOpenAI";

// The avatar (name, prompt, voice, model) is configured in app/avatar.ts, and the
// face in SIMLI_FACE_ID. Both are read on the server; only the name reaches the page.

export default function Demo() {
  return (
    <div className="bg-black min-h-screen flex flex-col items-center font-abc-repro font-normal text-sm text-white p-8">
      <SimliHeaderLogo />
      <Navbar />
      <div className="absolute top-[32px] right-[32px]">
        <a
          href="https://github.com/simliai/create-simli-app-openai"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold cursor-pointer mb-8 text-xl leading-8"
        >
          <Image className="w-[20px] inline mr-2" src={GitHubLogo} alt="" />
          create-simli-app (OpenAI)
        </a>
      </div>
      <div className="flex flex-col items-center gap-6 p-6 pb-[40px] rounded-xl w-full">
        <SimliOpenAI avatarName={avatar.name} />
      </div>

      <div className="max-w-[350px] font-thin flex flex-col items-center ">
        <span className="font-bold mb-[8px] leading-5 ">
          Create Simli App is a starter repo for creating visual avatars with Simli
        </span>
        <ul className="list-decimal list-inside max-w-[350px] ml-[6px] mt-2">
          <li className="mb-1">
            Fill in your OpenAI and Simli API keys in <code>.env.local</code> (see <code>.env.example</code>).
          </li>
          <li className="mb-1">
            Test out the interaction and have a talk with the OpenAI-powered, Simli-visualized avatar.
          </li>
          <li className="mb-1">
            Change the avatar&apos;s prompt and voice in <code>app/avatar.ts</code>, and its face with{" "}
            <code>SIMLI_FACE_ID</code>.
          </li>
        </ul>
        <span className=" mt-[16px]">
          Before deploying, protect the <code>/api</code> routes with auth or rate limiting (see the README).
        </span>
      </div>
    </div>
  );
}

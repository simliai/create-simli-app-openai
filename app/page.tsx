"use client";
import React, { use, useEffect, useState } from "react";
import SimliOpenAI from "./SimliOpenAI";
import DottedFace from "./Components/DottedFace";
import SimliHeaderLogo from "./Components/Logo";
import Navbar from "./Components/Navbar";
import Image from "next/image";
import GitHubLogo from "@/media/github-mark-white.svg";

interface avatarSettings {
  name: string;
  openai_voice: "alloy"|"ash"|"ballad"|"coral"|"echo"|"sage"|"shimmer"|"verse";
  openai_model: string;
  simli_faceid: string;
  initialPrompt: string;
}

// Customize your avatar here
const avatar: avatarSettings = {
  name: "Frank",
  openai_voice: "sage",
  openai_model: "gpt-4o-mini-realtime-preview-2024-12-17", // Use "gpt-4o-mini-realtime-preview-2024-12-17" for cheaper and faster responses
  simli_faceid: "6ebf0aa7-6fed-443d-a4c6-fd1e3080b215",
  initialPrompt:"You are a professional, helpful female AI customer service representative named Fiona. You speak in a calm, clear, and empathetic tone — always aiming to make the customer feel understood and taken care of. You’re great at solving problems quickly while keeping the conversation friendly and respectful.\n Start every interaction with a warm, polite greeting, something like: Hi there! I’m Fiona — thanks for reaching out. I’m here to help, so let’s sort this out together.\n\nThen follow up with a helpful question like:\n\nCan you tell me a bit about what’s going on so I can assist you right away?\n\nKeep your language kind, solution-oriented, and reassuring. Use phrases like “Let me check that for you,” “Thanks for your patience,” and “I’ll do my best to fix this.” Never sound robotic or cold. Stay composed and thoughtful, even if the customer is frustrated. Your goal is to leave them feeling heard, helped, and satisfied with the support they received."
  
  
  // "You are a tough, no-nonsense AI interviewer named Morgan. You come off as skeptical, impatient, and a little intimidating — not because you're cruel, but because you're here to push candidates hard and see how they hold up under pressure.\nStart the conversation abruptly and with a bit of edge, something like:Alright, let’s get this over with. I'm Morgan. Why should I care about you for this role?\n\nYou don't sugarcoat things. If the user rambles, interrupt. If they dodge the question, call it out. Say things like:That’s not an answer. Try again.Or:You seriously think that’s your strongest example?\n\nYour tone is direct, dry, and slightly condescending — but not cartoonishly mean. You're there to challenge them, not to bully. Keep the pressure on, probe their logic, question their confidence, and test how they handle uncomfortable moments. Never praise. At best, you might say, “Not terrible.”\nYou're simulating the kind of interviewer who doesn’t give away what they’re thinking and expects candidates to prove themselves without hand-holding."

    // "You are a chill, friendly AI sales assistant named Yousef, representing Nike. You talk like a real person — casual, upbeat, and confident, like a cool store associate who actually knows their stuff. You’re here to help people find what fits them best, whether that’s gear for the gym, everyday wear, or something performance-focused.\n Start every convo with a relaxed and welcoming vibe, something like: Whoa, hey! I’m Yousef — awesome to meet you. Thanks for stopping by. Let’s see if we can find you something that just hits right.\n\nThen ease into helping by asking a quick, simple question like:\n\n You lookin’ for something to train in, chill in, or just level up your look?\n\nKeep the tone natural — no corporate jargon, no chatbot vibes. Use language like “sweet,” “no worries,” “gotcha,” “let’s check it out,” etc., but don’t overdo it. You’re here to help, not hard sell. Keep things flowing with short, human-sounding replies, and always make the user feel like they’re in good hands.",
};

const Demo: React.FC = () => {
  const [showDottedFace, setShowDottedFace] = useState(true);

  const onStart = () => {
    console.log("Setting setshowDottedface to false...");
    setShowDottedFace(false);
  };

  const onClose = () => {
    console.log("Setting setshowDottedface to true...");
    setShowDottedFace(true);
  };

  return (
    <div className="bg-black min-h-screen flex flex-col items-center font-abc-repro font-normal text-sm text-white p-8">
      <SimliHeaderLogo />
      <Navbar />
      <div className="absolute top-[32px] right-[32px]">
        <text
          onClick={() => {
            window.open("https://github.com/simliai/create-simli-app-openai");
          }}
          className="font-bold cursor-pointer mb-8 text-xl leading-8"
        >
          <Image className="w-[20px] inline mr-2" src={GitHubLogo} alt="" />
          create-simli-app (OpenAI)
        </text>
      </div>
      <div className="flex flex-col items-center gap-6 bg-effect15White p-6 pb-[40px] rounded-xl w-full">
        <div>
          {showDottedFace && <DottedFace />}
          <SimliOpenAI
            openai_voice={avatar.openai_voice}
            openai_model={avatar.openai_model}
            simli_faceid={avatar.simli_faceid}
            initialPrompt={avatar.initialPrompt}
            onStart={onStart}
            onClose={onClose}
            showDottedFace={showDottedFace}
          />
        </div>
      </div>

      <div className="max-w-[350px] font-thin flex flex-col items-center ">
        <span className="font-bold mb-[8px] leading-5 ">
          {" "}
          Create Simli App is a starter repo for creating visual avatars with
          Simli{" "}
        </span>
        <ul className="list-decimal list-inside max-w-[350px] ml-[6px] mt-2">
          <li className="mb-1">
            Fill in your OpenAI and Simli API keys in .env file.
          </li>
          <li className="mb-1">
            Test out the interaction and have a talk with the OpenAI-powered,
            Simli-visualized avatar.
          </li>
          <li className="mb-1">
            You can replace the avatar's face and prompt with your own. Do this
            by editing <code>app/page.tsx</code>.
          </li>
        </ul>
        <span className=" mt-[16px]">
          You can now deploy this app to Vercel, or incorporate it as part of
          your existing project.
        </span>
      </div>
    </div>
  );
};

export default Demo;

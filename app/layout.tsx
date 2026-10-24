import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simli + OpenAI GPT-Live on LiveKit",
  description: "A LiveKit voice agent on OpenAI GPT-Live with a Simli avatar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

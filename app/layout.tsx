import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simli + OpenAI GPT-Live",
  description: "A real-time video avatar that talks with OpenAI GPT-Live, made with Simli.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simli + OpenAI Realtime",
  description: "A real-time video avatar that talks with OpenAI Realtime, made with Simli.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

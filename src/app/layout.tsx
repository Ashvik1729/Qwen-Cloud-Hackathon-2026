import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoDesk — MemoryAgent Chief-of-Staff",
  description: "Persistent-memory Chief-of-Staff agent with visible decay, consolidation, and recall benchmarks.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

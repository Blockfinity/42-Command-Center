import type { Metadata } from "next";
import { Geist, Geist_Mono, Saira_Stencil_One } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const stencil = Saira_Stencil_One({
  variable: "--font-stencil",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "42 // COMMAND DECK",
  description:
    "42 — a cinematic command interface for a gamified decentralized compute network. Place outposts, build territory, launch drone strikes, cyber attacks and espionage in real time across a real world map.",
  keywords: [
    "42",
    "decentralized compute",
    "command interface",
    "real-time strategy",
    "outposts",
    "factions",
  ],
  authors: [{ name: "42 Network" }],
  icons: {
    icon: "/fang-logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${stencil.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

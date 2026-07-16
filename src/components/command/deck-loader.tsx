"use client";

import dynamic from "next/dynamic";

// Client-side loader for CommandDeck. Uses next/dynamic with ssr: false so
// the full CommandDeck module graph (socket.io-client, framer-motion,
// lucide-react, zustand, the SFX engine, MapLibre GL) is NEVER evaluated on
// the server — only downloaded + executed in the browser after hydration.
//
// The server renders just the loading fallback (a black div), keeping the
// SSR response trivially fast.
const CommandDeck = dynamic(
  () => import("@/components/command/command-deck").then((m) => m.CommandDeck),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-black" />
    ),
  },
);

export function DeckLoader() {
  return <CommandDeck />;
}

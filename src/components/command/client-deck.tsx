"use client";

import dynamic from "next/dynamic";

// Client-only wrapper: `next/dynamic` with `ssr:false` must live in a Client
// Component. The server renders this wrapper as `null` (the dynamic component's
// default loading state), so the only server HTML for `/` is the static
// <BootShell/>. The deck hydrates on the client on top of the shell.
export const ClientCommandDeck = dynamic(
  () => import("@/components/command/command-deck").then((m) => m.CommandDeck),
  { ssr: false, loading: () => null }
);

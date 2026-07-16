import { DeckLoader } from "@/components/command/deck-loader";

// page.tsx is a SERVER component — it does nothing but render the client
// loader. This keeps the server render trivially fast (no client module
// evaluation, no dynamic import machinery in the server graph). The actual
// CommandDeck is loaded client-side via next/dynamic({ ssr: false }) inside
// the DeckLoader client component.
//
// force-static lets the dev server cache the rendered HTML shell after the
// first request instead of re-rendering the layout + page boundary on every
// hit — significantly reducing per-request variance in dev mode.
export const dynamic = "force-static";

export default function Home() {
  return <DeckLoader />;
}

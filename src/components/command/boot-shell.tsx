import * as React from "react";
import { BootScreen } from "@/components/command/boot-screen";
import { BootWallpaper } from "@/components/command/boot-wallpaper";

/**
 * Server-rendered static boot shell.
 *
 * This is the ONLY thing the server renders to HTML for the `/` route. It is
 * pure presentational markup (no hooks, no store, no client-only APIs) so the
 * server can emit it with near-zero work — no client-component SSR pipeline,
 * no RSC payload for an interactive tree.
 *
 * Memoized: takes no props, so React.memo makes this render exactly once. The
 * client deck hydrates on top (z-10) and drives the staged boot animation.
 */
function BootShellImpl() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex h-full w-full flex-col bg-background scanlines">
      {/* Full-viewport faction insignia wallpaper — renders FIRST (server HTML,
          instant first paint) and spans the entire screen behind all chrome.
          Negative z keeps it above the black base but below the header / nav /
          main / footer content. */}
      <BootWallpaper />

      {/* header slot — intentionally empty during boot. The FANG insignia is
          NOT shown here; it appears in the header only once the globe
          materializes (driven by the client CommandBar). The fixed-height
          slot preserves layout so the boot screen doesn't jump when the
          client deck hydrates and renders its own header. */}
      <header className="relative z-30 h-14 shrink-0 font-mono" />

      {/* center stage — boot screen while the uplink establishes */}
      <div className="relative flex min-h-0 flex-1">
        <nav className="w-12 shrink-0" aria-hidden />
        {/* main is intentionally TRANSPARENT during boot (no bg-black) so the
            root-level BootWallpaper shows through the entire viewport, not just
            around the loading area. The grid overlay + vignette are semi-
            transparent overlays that sit on top of the wallpaper. */}
        <main className="vignette relative min-w-0 flex-1">
          <div className="grid-overlay--major absolute inset-0 opacity-60" />
          <BootScreen error={false} armed={false} />
        </main>
      </div>

      {/* status bar slot — fixed height preserves layout */}
      <footer className="h-7 shrink-0 font-mono" />
    </div>
  );
}

// Memoized — no props, renders exactly once. Prevents any re-render from
// parent context changes.
export const BootShell = React.memo(BootShellImpl);

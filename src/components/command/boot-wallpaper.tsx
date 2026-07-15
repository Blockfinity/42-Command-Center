"use client";

import type { FactionId } from "@/lib/types";

/**
 * Faction wallpaper map — each faction has its own insignia.
 */
const FACTION_WALLPAPER: Record<FactionId, string> = {
  FANG: "/fang-logo.jpg",
  HAMMER: "/fang-logo.jpg", // fallback until HAMMER art exists
  RESOLUTE: "/resolute-logo.jpg",
};

/**
 * BootWallpaper — full-viewport faction insignia backdrop.
 * Rendered at the root of CommandDeck. Uses absolute inset-0 -z-10 so it
 * sits above the black base but below all chrome. The insignia is visible
 * across the entire screen (header, nav, main, footer regions) as a
 * barely-visible atmospheric wallpaper during the boot/globe phase.
 */
export function BootWallpaper({
  fadingOut,
  faction = "FANG",
}: {
  fadingOut?: boolean;
  faction?: FactionId;
}) {
  const src = FACTION_WALLPAPER[faction] ?? FACTION_WALLPAPER.FANG;
  return (
    <div
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-black ${
        fadingOut ? "boot-wallpaper-out" : "boot-wallpaper-in"
      }`}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        className="boot-wallpaper h-full w-full object-contain opacity-[0.06]"
        style={{ filter: "grayscale(1) contrast(1.2)" }}
      />
    </div>
  );
}

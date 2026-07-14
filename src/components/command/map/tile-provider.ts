// ---------------------------------------------------------------------------
// Tile provider — the swappable base map configuration.
//
// Default: Esri World Imagery (free, no API key, global satellite).
// This is the right choice for development and for production at scale —
// Esri's raster tiles have no per-request cost and no rate limit that matters
// for a tactical overlay application.
//
// PRODUCTION SCALING:
// For millions of users, the vector roads/buildings layer can be switched to
// self-hosted PMTiles on Cloudflare R2 (~$5/mo fixed, free egress). Set
// NEXT_PUBLIC_MAP_TILE_PROVIDER=self-hosted and configure the PMTiles URL.
// Zero code changes — just an env var swap.
//
// Future providers can be added by extending the switch below.
// ---------------------------------------------------------------------------

import type maplibregl from "maplibre-gl";

export type TileProviderId = "esri" | "maptiler" | "self-hosted";

/** Resolve the active tile provider from env. Defaults to Esri (free). */
export function getActiveTileProvider(): TileProviderId {
  const env = process.env.NEXT_PUBLIC_MAP_TILE_PROVIDER as TileProviderId | undefined;
  return env ?? "esri";
}

/**
 * Build the raster source spec for the active tile provider.
 * Returns a MapLibre source spec that can be spread into the style's `sources`.
 */
export function buildRasterSource(): maplibregl.SourceSpecification {
  const provider = getActiveTileProvider();

  switch (provider) {
    case "maptiler": {
      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      return {
        type: "raster",
        tiles: [
          `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${key ?? ""}`,
        ],
        tileSize: 256,
        attribution: "MapTiler",
        maxzoom: 19,
      };
    }
    case "self-hosted": {
      const url = process.env.NEXT_PUBLIC_PMTILES_URL ?? "";
      return {
        type: "raster",
        tiles: [`${url}/{z}/{x}/{y}.png`],
        tileSize: 256,
        maxzoom: 14,
      };
    }
    case "esri":
    default:
      return {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Esri, Maxar, Earthstar Geographics",
        maxzoom: 19,
      };
  }
}

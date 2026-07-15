// ---------------------------------------------------------------------------
// Tile provider — the swappable base map configuration.
//
// Default: Esri World Imagery (free, no API key, global satellite).
// This is the right choice for production at scale — Esri's raster tiles have
// no per-request cost and no rate limit that matters for a tactical overlay.
//
// DEV: MapTiler free tier (100K tile loads/mo). Set:
//   NEXT_PUBLIC_MAP_TILE_PROVIDER=maptiler
//   NEXT_PUBLIC_MAPTILER_KEY=<your-key>
// MapTiler provides BOTH raster satellite AND vector tiles (roads, buildings,
// labels) in the OpenMapTiles schema — so the dev experience is richer than
// the Esri-only production baseline.
//
// PRODUCTION SCALING:
// For millions of users, switch to self-hosted PMTiles on Cloudflare R2
// (~$5/mo fixed, free egress). Set:
//   NEXT_PUBLIC_MAP_TILE_PROVIDER=self-hosted
//   NEXT_PUBLIC_PMTILES_URL=<your-r2-url>
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
      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
      return {
        type: "raster",
        tiles: [
          `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${key}`,
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

/**
 * Build the vector source spec for roads/buildings/labels.
 * Returns null if the active provider doesn't ship vector tiles (e.g. Esri
 * satellite-only). The roads/buildings layers check this and skip mounting
 * when null — so the map degrades gracefully on providers without vector data.
 */
export function buildVectorSource(): maplibregl.VectorSourceSpecification | null {
  const provider = getActiveTileProvider();

  switch (provider) {
    case "maptiler": {
      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
      return {
        type: "vector",
        tiles: [
          `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${key}`,
        ],
        attribution: "MapTiler, OpenStreetMap",
        maxzoom: 14,
      };
    }
    case "self-hosted": {
      const url = process.env.NEXT_PUBLIC_PMTILES_VECTOR_URL ??
        process.env.NEXT_PUBLIC_PMTILES_URL ?? "";
      if (!url) return null;
      return {
        type: "vector",
        tiles: [`${url}/{z}/{x}/{y}.pbf`],
        maxzoom: 14,
      };
    }
    case "esri":
    default:
      // Esri satellite-only baseline has no vector tiles.
      // Roads/buildings layers will skip mounting.
      return null;
  }
}

/**
 * Whether the active provider ships vector tiles (roads/buildings/labels).
 * Layers use this to decide whether to mount.
 */
export function hasVectorTiles(): boolean {
  return buildVectorSource() !== null;
}

// ---------------------------------------------------------------------------
// Tile provider — the swappable base map configuration.
//
// DEFAULT (no env needed): Esri World Imagery raster (free, no key, global
// satellite) for the base imagery + OpenFreeMap vector tiles (free, no key,
// OpenMapTiles schema) for roads + 3D building footprints. Both are free with
// no API key, so the 3D cityscape renders out-of-the-box with zero config.
//
// DEV (optional, richer): MapTiler free tier (100K tile loads/mo). Set:
//   NEXT_PUBLIC_MAP_TILE_PROVIDER=maptiler
//   NEXT_PUBLIC_MAPTILER_KEY=<your-key>
// MapTiler provides BOTH raster satellite AND vector tiles (roads, buildings,
// labels) in the OpenMapTiles schema — so the dev experience is richer than
// the Esri+OpenFreeMap baseline.
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
 *
 * DEFAULT (esri): returns OpenFreeMap vector tiles — a free, no-API-key,
 * OpenMapTiles-schema vector tile service (https://openfreemap.org). This
 * ships the `building` source-layer (with `render_height` / `render_min_height`
 * for 3D fill-extrusion) and the `transportation` source-layer (roads), so the
 * 3D cityscape + road network render out-of-the-box with zero configuration.
 *
 * OpenFreeMap fair-use limits are generous and suitable for dev + moderate
 * production. For very high traffic, swap to self-hosted PMTiles (see the
 * "self-hosted" case below).
 *
 * Returns null only if the active provider is "self-hosted" but no URL is
 * configured. The roads/buildings layers check the source and skip mounting
 * when absent — so the map degrades gracefully.
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
      // Free, no-key OpenMapTiles-schema vector tiles via OpenFreeMap
      // (https://openfreemap.org). Provides the `building` source-layer (with
      // render_height) that buildings.layer.ts extrudes into 3D, plus
      // `transportation` (roads), `water`, `landuse`. Combined with the Esri
      // raster satellite base, this gives the full dark 3D cityscape with
      // zero configuration.
      //
      // IMPORTANT: OpenFreeMap serves tiles via a TileJSON metadata endpoint
      // (https://tiles.openfreemap.org/planet) whose `tiles` array points at a
      // VERSIONED path (e.g. /planet/20260621_080001_pt/{z}/{x}/{y}.pbf) that
      // changes with each data refresh. We MUST use the `url` field (TileJSON)
      // — NOT a hardcoded `tiles` template — so MapLibre resolves the current
      // version automatically. Hardcoding the path would break on every
      // OpenFreeMap data refresh.
      return {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: "OpenFreeMap, OpenStreetMap",
      };
  }
}

/**
 * Whether the active provider ships vector tiles (roads/buildings/labels).
 * Layers use this to decide whether to mount.
 */
export function hasVectorTiles(): boolean {
  return buildVectorSource() !== null;
}

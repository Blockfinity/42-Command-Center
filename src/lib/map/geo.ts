// ---------------------------------------------------------------------------
// Geo math — pure functions for spherical geometry on the 3D globe.
// Extracted from world-map.tsx for testability and reuse.
// ---------------------------------------------------------------------------

import type { GeoJSON } from "geojson";

/** Spherical linear interpolation between two [lng,lat] points → great-circle arc. */
export function greatCircle(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const toCart = ([lng, lat]: [number, number]) => {
    const rl = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180;
    return [Math.cos(p) * Math.cos(rl), Math.cos(p) * Math.sin(rl), Math.sin(p)];
  };
  const fromCart = ([x, y, z]: number[]) =>
    [(Math.atan2(y, x) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI] as [number, number];
  const ca = toCart(a), cb = toCart(b);
  const dot = ca[0] * cb[0] + ca[1] * cb[1] + ca[2] * cb[2];
  const omega = Math.acos(Math.min(1, Math.max(-1, dot)));
  if (omega < 0.0001) return [a, b];
  const sinO = Math.sin(omega);
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k1 = Math.sin((1 - t) * omega) / sinO;
    const k2 = Math.sin(t * omega) / sinO;
    pts.push(fromCart([k1 * ca[0] + k2 * cb[0], k1 * ca[1] + k2 * cb[1], k1 * ca[2] + k2 * cb[2]]));
  }
  return pts;
}

/** Sample a point at fraction t (0..1) along a great-circle arc. */
export function greatCirclePoint(a: [number, number], b: [number, number], t: number): [number, number] {
  const toCart = ([lng, lat]: [number, number]) => {
    const rl = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180;
    return [Math.cos(p) * Math.cos(rl), Math.cos(p) * Math.sin(rl), Math.sin(p)];
  };
  const fromCart = ([x, y, z]: number[]) =>
    [(Math.atan2(y, x) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI] as [number, number];
  const ca = toCart(a), cb = toCart(b);
  const dot = ca[0] * cb[0] + ca[1] * cb[1] + ca[2] * cb[2];
  const omega = Math.acos(Math.min(1, Math.max(-1, dot)));
  if (omega < 0.0001) return a;
  const sinO = Math.sin(omega);
  const k1 = Math.sin((1 - t) * omega) / sinO;
  const k2 = Math.sin(t * omega) / sinO;
  return fromCart([k1 * ca[0] + k2 * cb[0], k1 * ca[1] + k2 * cb[1], k1 * ca[2] + k2 * cb[2]]);
}

/** Geographic circle polygon (for territory halos). */
export function geoCircle(center: [number, number], radiusDeg: number, n = 48): GeoJSON.Polygon {
  const [clng, clat] = center;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const brg = (i / n) * 2 * Math.PI;
    const dLat = (radiusDeg * Math.cos(brg)) / 1.0;
    const dLng = (radiusDeg * Math.sin(brg)) / Math.cos((clat * Math.PI) / 180);
    pts.push([clng + dLng, clat + dLat]);
  }
  return { type: "Polygon", coordinates: [pts] };
}

/**
 * Equirectangular angular distance in degrees between two [lng,lat] points.
 * Cheap (no trig per-call beyond one cos) — used to cull pings outside the
 * visible hemisphere so we don't feed the renderer geometry that won't be seen.
 */
export function approxAngularDist(lng1: number, lat1: number, lng2: number, lat2: number): number {
  // Wrap longitude difference to [-180, 180] so pings near the antimeridian
  // are measured by the short way around, not the long way.
  let dLngRaw = lng2 - lng1;
  if (dLngRaw > 180) dLngRaw -= 360;
  else if (dLngRaw < -180) dLngRaw += 360;
  const dLng = dLngRaw * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  const dLat = lat2 - lat1;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Format total actions with K/M/B suffixes for the HUD readout. */
export function formatTotalActions(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

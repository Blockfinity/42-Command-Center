// ===== 42 — Centralized boot cascade utility =====
//
// Decouples cascade timing into independent, maintainable groups.
// Each group (header, nav, status, hud, map-data) has its own stagger
// interval. To retune timing globally, change one number. To add/remove
// an item, change its index.
//
// Usage:
//   <div style={cascadeStyle("header", 0)} className="term-cascade">…</div>
//   <button style={cascadeStyle("nav", 3)} className="term-cascade">…</button>
//
// The `.term-cascade` class starts at opacity:0. When the parent receives
// `.boot-active`, each child fades in using its `--cd` (cascade delay)
// custom property.

export type CascadeGroup = "header" | "nav" | "status" | "hud" | "map-data";

/**
 * Per-group stagger interval (milliseconds between consecutive items).
 * Tune these to speed up / slow down each region independently.
 */
export const CASCADE_INTERVAL: Record<CascadeGroup, number> = {
  header: 60, // L→R stats
  nav: 45, // T→B icons
  status: 50, // status bar items
  hud: 70, // map HUD overlays
  "map-data": 220, // glitch groups (halos → marks → vectors)
};

/**
 * Base offset (ms) before each group's first item starts.
 * Stages the groups so header begins, then nav, then status…
 */
export const CASCADE_BASE: Record<CascadeGroup, number> = {
  header: 0,
  nav: 120,
  status: 240,
  hud: 360,
  "map-data": 0, // map-data is triggered separately (glitch phase)
};

/**
 * Returns a CSS custom-property style object carrying the cascade delay.
 * Apply this to any element with className="term-cascade" (or "data-glitch-in"
 * for the map-data group).
 *
 *   index 0 → first item (shortest delay)
 *   index 1 → second item
 *   …
 */
export function cascadeStyle(
  group: CascadeGroup,
  index: number,
): React.CSSProperties {
  const delay = CASCADE_BASE[group] + index * CASCADE_INTERVAL[group];
  return { ["--cd" as string]: `${delay}ms` };
}

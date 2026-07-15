"use client";

import * as React from "react";

/**
 * useSfx — a small Web Audio sound-effects hook for the command deck.
 *
 * Generates short blip/confirm/deny/etc. tones via an OscillatorNode so the
 * app needs no audio asset files. Also exposes a ticking ambience and a
 * global mute toggle shared across all callers (module-level singleton).
 *
 * API:
 *   sfx.play(name)         — play a named cue ("key" | "click" | "confirm"
 *                            | "deny" | "select" | "transition" | "place")
 *                            Cues may be backed by a real audio asset
 *                            (see CUES.asset) instead of an oscillator.
 *   sfx.playAsset(url)     — play a real audio file directly (e.g. the
 *                            "link established" stinger). Respects mute.
 *   sfx.resume()           — resume the AudioContext (must be called after a
 *                            user gesture; browsers block autoplay)
 *   sfx.toggle()           — flip the muted flag
 *   sfx.muted              — current mute state
 *   sfx.startTicking(ms)   — start a repeating low tick at the given interval
 *   sfx.stopTicking()      — stop the ticking ambience
 */

type CueName = "key" | "click" | "confirm" | "deny" | "select" | "transition" | "place" | "boot" | "powerOn" | "hotkey";

// ── module-level singleton (shared across all hook callers) ──────────────
let _ctx: AudioContext | null = null;
let _muted = false;
let _tickTimer: ReturnType<typeof setInterval> | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      _ctx = new AC();
    } catch {
      return null;
    }
  }
  return _ctx;
}

const CUES: Record<
  CueName,
  {
    freq: number;
    dur: number;
    type?: OscillatorType;
    sweep?: number;
    /** If set, play this audio file instead of synthesizing an oscillator. */
    asset?: string;
    /** Volume for the asset-backed cue (0–1). Defaults to 0.8. */
    assetVolume?: number;
    /**
     * If true, each play is an INDEPENDENT instance that runs to completion
     * and overlaps cleanly with subsequent plays (no rewind/cut-off). Used
     * for rapid-fire cues like the boot sequence where each chime must be
     * individual even when triggered every 240ms. Backed by a decoded
     * AudioBuffer + one-shot AudioBufferSourceNodes (see playBuffer).
     * Default false = cached HTMLAudioElement rewind+replay (restart style).
     */
    overlap?: boolean;
  }
> = {
  key: { freq: 880, dur: 0.06, type: "square" },
  // UI button click — backed by the real recorded asset so every button
  // click sounds consistent. The oscillator params are kept only as a
  // fallback description (unused when `asset` is set).
  click: { freq: 660, dur: 0.04, type: "square", asset: "/sounds/ui-button-click.mp3", assetVolume: 0.55 },
  confirm: { freq: 740, dur: 0.12, type: "triangle", sweep: 1.5 },
  deny: { freq: 180, dur: 0.18, type: "sawtooth", sweep: 0.5 },
  select: { freq: 520, dur: 0.05, type: "square" },
  // Hot key icon press — backed by the real recorded asset. Plays when the
  // user clicks a nav-rail icon OR presses the corresponding keyboard
  // shortcut (1–8). Distinct from `click` (generic button) so hot-key
  // activations have their own signature cue.
  hotkey: { freq: 700, dur: 0.05, type: "square", asset: "/sounds/hot-key-icon.wav", assetVolume: 0.6 },
  transition: { freq: 420, dur: 0.1, type: "triangle", sweep: 1.8 },
  place: { freq: 300, dur: 0.14, type: "triangle", sweep: 2.2 },
  // Boot sequence tick — backed by the real recorded asset, played once per
  // boot line as it prints (except the final "UPLINK ESTABLISHED" line,
  // which is covered by the link-established.mp3 stinger; the boot-screen
  // component suppresses the cue for that last line). `overlap: true` so
  // each chime is an independent instance that plays fully and overlaps
  // cleanly with the next (240ms interval vs 1.3s sound — without overlap
  // the cached element would be rewound mid-play and sound choppy).
  boot: { freq: 180, dur: 0.04, type: "square", asset: "/sounds/bootup.mp3", assetVolume: 0.5, overlap: true },
  powerOn: { freq: 160, dur: 0.6, type: "triangle", sweep: 5.5 },
};

function playCue(name: CueName) {
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const spec = CUES[name] ?? CUES.click;

  // Asset-backed cue? Play the real file instead of synthesizing.
  if (spec.asset) {
    playAsset(spec.asset, { volume: spec.assetVolume ?? 0.8, overlap: spec.overlap ?? false });
    return;
  }

  // powerOn — custom rising-sweep envelope (quiet build → peak → quick cutoff)
  // Feels like a proper "system online" moment, not a static blip.
  // (No longer used at boot — the "link established" stinger replaced it.)
  if (name === "powerOn") {
    const t0 = c.currentTime;
    const dur = 0.6;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(880, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.05, t0 + dur * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.14, t0 + dur * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return;
  }

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = spec.type ?? "square";
  const t0 = c.currentTime;
  osc.frequency.setValueAtTime(spec.freq, t0);
  if (spec.sweep) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, spec.freq * spec.sweep),
      t0 + spec.dur,
    );
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + spec.dur + 0.02);
}

// ── Asset playback ──────────────────────────────────────────────────────
// Two playback paths for real audio files:
//
//   1. Cached HTMLAudioElement (rewind + replay) — the DEFAULT. Used for
//      "restart" cues like UI button clicks where rapid re-triggering should
//      cut the previous sound and restart from the beginning. One element per
//      URL is cached; `currentTime = 0` + `play()` restarts it instantly.
//
//   2. Web Audio AudioBuffer (one-shot source nodes) — opt-in via
//      `overlap: true`. Used for cues like the boot sequence where each
//      chime must play FULLY and overlap cleanly with the next, even when
//      triggered every 240ms (vs a 1.3s sound). The file is fetched + decoded
//      ONCE into an in-memory AudioBuffer (via fetch + decodeAudioData);
//      each play creates a fresh AudioBufferSourceNode that plays to
//      completion and is GC'd. No re-fetching, no cut-offs, true overlap.
//
// Both paths respect the shared `_muted` flag and resume the AudioContext.
const _assetCache = new Map<string, HTMLAudioElement>();
const _bufferCache = new Map<string, AudioBuffer>();

function getOrCreateAsset(url: string): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let el = _assetCache.get(url);
  if (!el) {
    try {
      el = new Audio(url);
      el.preload = "auto";
      _assetCache.set(url, el);
    } catch {
      return null;
    }
  }
  return el;
}

/** Create + fetch the HTMLAudioElement without playing, so the first play() is instant. */
function prewarmAsset(url: string): void {
  getOrCreateAsset(url);
}

/**
 * Fetch + decode the audio file into an AudioBuffer for overlap-capable
 * playback (see playBuffer). Idempotent — safe to call multiple times for
 * the same URL. Runs asynchronously; the buffer becomes available in
 * _bufferCache once decode completes.
 */
async function preloadBuffer(url: string): Promise<void> {
  if (_bufferCache.has(url)) return;
  const c = ctx();
  if (!c) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const arr = await res.arrayBuffer();
    const buf = await c.decodeAudioData(arr);
    _bufferCache.set(url, buf);
  } catch {
    // decode failed — fall back to the HTMLAudioElement path at play time
  }
}

/**
 * Play a decoded AudioBuffer as a one-shot source node. Each call creates a
 * fresh AudioBufferSourceNode + GainNode so simultaneous calls overlap
 * cleanly without interfering. Source nodes auto-stop after the buffer ends
 * and are GC'd — no cleanup needed.
 */
function playBuffer(url: string, opts?: { volume?: number }): boolean {
  if (_muted) return false;
  const c = ctx();
  if (!c) return false;
  const buf = _bufferCache.get(url);
  if (!buf) return false;
  if (c.state === "suspended") c.resume().catch(() => {});
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = Math.min(1, Math.max(0, opts?.volume ?? 0.8));
    src.connect(gain).connect(c.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

function playAsset(
  url: string,
  opts?: { volume?: number; overlap?: boolean },
): HTMLAudioElement | null {
  if (_muted) return null;
  if (typeof window === "undefined") return null;
  // Resume the shared context so any concurrent oscillator cues + the asset
  // share the same unlocked audio session.
  const c = ctx();
  if (c && c.state === "suspended") c.resume().catch(() => {});

  const volume = Math.min(1, Math.max(0, opts?.volume ?? 0.8));
  const overlap = opts?.overlap ?? false;

  // Overlap path: try the decoded AudioBuffer first (zero-latency, true
  // overlap, no cut-offs). If the buffer isn't decoded yet, fall through to
  // the HTMLAudioElement path as a fallback.
  if (overlap && playBuffer(url, { volume })) {
    return null;
  }

  // Default / fallback: cached HTMLAudioElement, rewind + replay.
  const el = getOrCreateAsset(url);
  if (!el) return null;
  try {
    el.volume = volume;
    // Rewind so rapid re-clicks replay from the start instead of continuing
    // the previous playback.
    el.currentTime = 0;
    // best-effort: play() returns a promise that can reject if the browser
    // still considers this a non-gesture autoplay; swallow that quietly.
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    return el;
  } catch {
    return null;
  }
}

function playTick() {
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  const t0 = c.currentTime;
  osc.frequency.setValueAtTime(120, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + 0.06);
}

export interface SfxApi {
  play: (name: CueName) => void;
  /**
   * Play a real audio asset (e.g. the "link established" stinger). Respects
   * mute. Pass `overlap: true` for rapid-fire cues where each play should be
   * an independent instance that overlaps cleanly with the next (uses a
   * decoded AudioBuffer + one-shot source nodes).
   */
  playAsset: (url: string, opts?: { volume?: number; overlap?: boolean }) => void;
  resume: () => void;
  toggle: () => void;
  muted: boolean;
  startTicking: (ms: number) => void;
  stopTicking: () => void;
}

export function useSfx(): SfxApi {
  // re-render when muted flips so consumers see the change
  const [muted, setMuted] = React.useState(_muted);

  // Prewarm every asset-backed cue so the first play is latency-free:
  //   • HTMLAudioElement prewarm (getOrCreateAsset) for all asset cues
  //   • AudioBuffer preload (fetch + decode) for overlap cues, so the
  //     one-shot source-node path is ready immediately
  // Runs once per mount; both are idempotent via their caches.
  React.useEffect(() => {
    for (const spec of Object.values(CUES)) {
      if (!spec.asset) continue;
      prewarmAsset(spec.asset);
      if (spec.overlap) void preloadBuffer(spec.asset);
    }
  }, []);

  const play = React.useCallback((name: CueName) => playCue(name), []);
  const playAssetCb = React.useCallback(
    (url: string, opts?: { volume?: number; overlap?: boolean }) => {
      playAsset(url, opts);
    },
    [],
  );
  const resume = React.useCallback(() => {
    const c = ctx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  }, []);
  const toggle = React.useCallback(() => {
    _muted = !_muted;
    setMuted(_muted);
    if (_muted && _tickTimer) {
      clearInterval(_tickTimer);
      _tickTimer = null;
    }
  }, []);
  const startTicking = React.useCallback((ms: number) => {
    if (_tickTimer) clearInterval(_tickTimer);
    _tickTimer = setInterval(playTick, ms);
  }, []);
  const stopTicking = React.useCallback(() => {
    if (_tickTimer) {
      clearInterval(_tickTimer);
      _tickTimer = null;
    }
  }, []);

  return { play, playAsset: playAssetCb, resume, toggle, muted, startTicking, stopTicking };
}

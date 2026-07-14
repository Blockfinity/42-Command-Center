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

type CueName = "key" | "click" | "confirm" | "deny" | "select" | "transition" | "place" | "boot" | "powerOn";

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
  transition: { freq: 420, dur: 0.1, type: "triangle", sweep: 1.8 },
  place: { freq: 300, dur: 0.14, type: "triangle", sweep: 2.2 },
  boot: { freq: 180, dur: 0.04, type: "square" },
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
    playAsset(spec.asset, { volume: spec.assetVolume ?? 0.8 });
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
// Plays a real audio file (e.g. the "link established" stinger, or the UI
// button-click asset backing the `click` cue) via an HTMLAudioElement.
// Respects the same module-level `_muted` flag as the oscillator cues and
// resumes the shared AudioContext so the asset is audible after a user
// gesture.
//
// Elements are cached per URL (module-level Map) so rapid re-triggering —
// e.g. clicking several buttons quickly — rewinds + replays instantly
// without allocating a new element each time. `prewarmAsset(url)` creates
// (and starts fetching) an element without playing, so the first click is
// latency-free.
const _assetCache = new Map<string, HTMLAudioElement>();

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

/** Create + fetch the asset without playing, so the first play() is instant. */
function prewarmAsset(url: string): void {
  getOrCreateAsset(url);
}

function playAsset(url: string, opts?: { volume?: number }): HTMLAudioElement | null {
  if (_muted) return null;
  if (typeof window === "undefined") return null;
  // Resume the shared context so any concurrent oscillator cues + the asset
  // share the same unlocked audio session.
  const c = ctx();
  if (c && c.state === "suspended") c.resume().catch(() => {});

  const el = getOrCreateAsset(url);
  if (!el) return null;
  try {
    el.volume = Math.min(1, Math.max(0, opts?.volume ?? 0.8));
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
  /** Play a real audio asset (e.g. the "link established" stinger). Respects mute. */
  playAsset: (url: string, opts?: { volume?: number }) => void;
  resume: () => void;
  toggle: () => void;
  muted: boolean;
  startTicking: (ms: number) => void;
  stopTicking: () => void;
}

export function useSfx(): SfxApi {
  // re-render when muted flips so consumers see the change
  const [muted, setMuted] = React.useState(_muted);

  // Prewarm every asset-backed cue (fetch without playing) so the first
  // click on any button is latency-free. Runs once per mount; idempotent
  // because getOrCreateAsset caches the element.
  React.useEffect(() => {
    for (const spec of Object.values(CUES)) {
      if (spec.asset) prewarmAsset(spec.asset);
    }
  }, []);

  const play = React.useCallback((name: CueName) => playCue(name), []);
  const playAssetCb = React.useCallback(
    (url: string, opts?: { volume?: number }) => {
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

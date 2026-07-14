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

const CUES: Record<CueName, { freq: number; dur: number; type?: OscillatorType; sweep?: number }> = {
  key: { freq: 880, dur: 0.06, type: "square" },
  click: { freq: 660, dur: 0.04, type: "square" },
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

  // powerOn — custom rising-sweep envelope (quiet build → peak → quick cutoff)
  // Feels like a proper "system online" moment, not a static blip.
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

  const spec = CUES[name] ?? CUES.click;
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
  resume: () => void;
  toggle: () => void;
  muted: boolean;
  startTicking: (ms: number) => void;
  stopTicking: () => void;
}

export function useSfx(): SfxApi {
  // re-render when muted flips so consumers see the change
  const [muted, setMuted] = React.useState(_muted);

  const play = React.useCallback((name: CueName) => playCue(name), []);
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

  return { play, resume, toggle, muted, startTicking, stopTicking };
}

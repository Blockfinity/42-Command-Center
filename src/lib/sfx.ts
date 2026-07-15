/**
 * SfxEngine — procedural Web Audio synthesis for the "42" command interface.
 *
 * All sounds are generated at runtime via the Web Audio API (no audio asset
 * files). Master chain: source → 16kHz lowpass → master gain (≈0.3) → destination.
 *
 * AudioContext is created lazily on the first `resume()` call to satisfy the
 * browser autoplay policy. Mute state is persisted to localStorage under
 * `"42-sfx-muted"`. A live debug handle is exposed at `window.__sfxDebug`.
 */

export type SoundName =
  | 'boot'
  | 'glitch'
  | 'confirm'
  | 'click'
  | 'hover'
  | 'select'
  | 'place'
  | 'deny'
  | 'notify'
  | 'key'
  | 'tick'
  | 'transition'
  | 'ready';

const MUTE_KEY = '42-sfx-muted';

// Master output level (post-lowpass).
const MASTER_GAIN = 0.3;

// Cutoff for the mastering lowpass — tames stacked high partials.
const MASTER_LP = 16000;

/**
 * Procedural SFX engine. Singleton — import the `sfx` instance, do not
 * construct your own.
 */
class SfxEngine {
  private ctx: AudioContext | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private master: GainNode | null = null;

  private _muted = false;
  private playCount = 0;
  private lastSound: string | null = null;

  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this._muted = window.localStorage.getItem(MUTE_KEY) === '1';
      } catch {
        this._muted = false;
      }

      // Expose a live debug handle for browser verification.
      // Arrow getters capture `this` lexically (no `this` aliasing).
      const debug: Record<string, unknown> = {};
      Object.defineProperty(debug, 'playCount', {
        get: () => this.playCount,
        configurable: true,
      });
      Object.defineProperty(debug, 'lastSound', {
        get: () => this.lastSound,
        configurable: true,
      });
      Object.defineProperty(debug, 'state', {
        get: (): AudioContextState => this.ctx?.state ?? 'suspended',
        configurable: true,
      });
      (window as any).__sfxDebug = debug;
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Unlock / create the AudioContext. Must be called from a user gesture
   * (click / keypress) the first time — browsers block autoplay otherwise.
   */
  resume(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;

      this.ctx = new AC();

      // Master chain: input(lowpass) → master gain → destination.
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = MASTER_LP;
      this.lowpass.Q.value = 0.7;

      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : MASTER_GAIN;

      this.lowpass.connect(this.master);
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        /* gesture may not have been sufficient — ignore */
      });
    }
  }

  /**
   * Play a sound by name. No-ops silently when muted or when the
   * AudioContext has not yet been unlocked.
   */
  play(name: SoundName): void {
    if (this._muted) return;
    if (!this.ctx || !this.lowpass) return;

    // Increment counters for debug verification.
    this.playCount += 1;
    this.lastSound = name;

    const ctx = this.ctx;
    const dest = this.lowpass;

    switch (name) {
      case 'boot':
        this.playBoot(ctx, dest);
        break;
      case 'glitch':
        this.playGlitch(ctx, dest);
        break;
      case 'confirm':
        this.playConfirm(ctx, dest);
        break;
      case 'click':
        this.playClick(ctx, dest);
        break;
      case 'hover':
        this.playHover(ctx, dest);
        break;
      case 'select':
        this.playSelect(ctx, dest);
        break;
      case 'place':
        this.playPlace(ctx, dest);
        break;
      case 'deny':
        this.playDeny(ctx, dest);
        break;
      case 'notify':
        this.playNotify(ctx, dest);
        break;
      case 'key':
        this.playKey(ctx, dest);
        break;
      case 'tick':
        this.playTick(ctx, dest);
        break;
      case 'transition':
        this.playTransition(ctx, dest);
        break;
      case 'ready':
        this.playReady(ctx, dest);
        break;
    }
  }

  /** Toggle mute on/off and persist to localStorage. */
  toggle(): void {
    this._muted = !this._muted;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0');
      } catch {
        /* storage may be unavailable — ignore */
      }
    }
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this._muted ? 0 : MASTER_GAIN, now);
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  /**
   * Start a repeating `tick` for loading-bar progress. Safe to call multiple
   * times — only one interval is ever active.
   */
  startTicking(intervalMs: number = 170): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = setInterval(() => this.play('tick'), intervalMs);
  }

  /** Stop the loading-bar ticker. */
  stopTicking(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Sound implementations
  // --------------------------------------------------------------------------

  /** boot — low 60/120/240Hz drone, 1.6s, evolving. */
  private playBoot(ctx: AudioContext, dest: AudioNode): void {
    const dur = 1.6;
    const t0 = ctx.currentTime;

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t0);
    bus.gain.linearRampToValueAtTime(0.65, t0 + 0.45);
    bus.gain.linearRampToValueAtTime(0.5, t0 + dur);
    bus.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.35);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, t0);
    filter.frequency.exponentialRampToValueAtTime(1400, t0 + dur);
    filter.Q.value = 5;

    filter.connect(bus);
    bus.connect(dest);

    const freqs: Array<{ f: number; type: OscillatorType; amp: number }> = [
      { f: 60, type: 'sine', amp: 0.75 },
      { f: 120, type: 'sawtooth', amp: 0.28 },
      { f: 240, type: 'sawtooth', amp: 0.14 },
    ];

    freqs.forEach((spec, i) => {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = spec.f;
      // Slow detune drift → evolving character.
      osc.detune.setValueAtTime(-6 * (i + 1), t0);
      osc.detune.linearRampToValueAtTime(6 * (i + 1), t0 + dur);

      const g = ctx.createGain();
      g.gain.value = spec.amp;

      osc.connect(g);
      g.connect(filter);
      osc.start(t0);
      osc.stop(t0 + dur + 0.4);
    });

    // Sub octave sine for weight.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 30;
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0, t0);
    subG.gain.linearRampToValueAtTime(0.4, t0 + 0.5);
    subG.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.2);
    sub.connect(subG);
    subG.connect(filter);
    sub.start(t0);
    sub.stop(t0 + dur + 0.3);
  }

  /** glitch — bandpass noise burst + ring-mod metallic stutters + crackle. */
  private playGlitch(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;

    // --- Bandpass noise burst ---
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700, t0);
    bp.frequency.exponentialRampToValueAtTime(3500, t0 + 0.2);
    bp.Q.value = 7;
    const noiseG = ctx.createGain();
    noiseG.gain.setValueAtTime(0.5, t0);
    noiseG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    noise.connect(bp);
    bp.connect(noiseG);
    noiseG.connect(dest);
    noise.start(t0);
    noise.stop(t0 + 0.3);

    // --- Ring-mod metallic stutters (3 short bursts, inharmonic ratios) ---
    const stutterTimes = [0.05, 0.13, 0.21];
    const carrierFreqs = [1240, 980, 1620];
    const modFreqs = [1750, 1410, 2230];
    stutterTimes.forEach((offset, i) => {
      const ts = t0 + offset;
      const carrier = ctx.createOscillator();
      carrier.type = 'square';
      carrier.frequency.value = carrierFreqs[i];

      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = modFreqs[i];

      const modGain = ctx.createGain();
      modGain.gain.value = 1; // ring-mod depth: ±1 multiplication

      const ring = ctx.createGain();
      ring.gain.value = 0; // base 0; mod oscillation drives ±1

      mod.connect(modGain);
      modGain.connect(ring.gain);
      carrier.connect(ring);

      const outG = ctx.createGain();
      outG.gain.setValueAtTime(0, ts);
      outG.gain.linearRampToValueAtTime(0.16, ts + 0.004);
      outG.gain.exponentialRampToValueAtTime(0.0001, ts + 0.06);

      ring.connect(outG);
      outG.connect(dest);

      carrier.start(ts);
      mod.start(ts);
      carrier.stop(ts + 0.07);
      mod.stop(ts + 0.07);
    });

    // --- Crackle: sparse tiny impulses ---
    for (let i = 0; i < 6; i++) {
      const ts = t0 + Math.random() * 0.28;
      const click = ctx.createOscillator();
      click.type = 'square';
      click.frequency.value = 2000 + Math.random() * 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08 + Math.random() * 0.05, ts);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.01);
      click.connect(g);
      g.connect(dest);
      click.start(ts);
      click.stop(ts + 0.02);
    }
  }

  /** confirm — ascending C-E-G triad, detuned stack + shimmer. */
  private playConfirm(ctx: AudioContext, dest: AudioNode): void {
    const notes = [261.63, 329.63, 392.0]; // C4, E4, G4
    const stepDelay = 0.09;
    const detuneCents = [-7, 0, 7];

    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * stepDelay;
      const dur = 0.55;

      // Detuned sawtooth stack.
      detuneCents.forEach((cents) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.11, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });

      // Shimmer harmonic (4× the note).
      const shim = ctx.createOscillator();
      shim.type = 'sine';
      shim.frequency.value = f * 4;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(0.06, t + 0.015);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      shim.connect(sg);
      sg.connect(dest);
      shim.start(t);
      shim.stop(t + dur + 0.15);
    });
  }

  /** click — triangle 880→420Hz pitch drop, filter sweep 6000→600Hz, sub-bass. */
  private playClick(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.15;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.exponentialRampToValueAtTime(420, t0 + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(6000, t0);
    filter.frequency.exponentialRampToValueAtTime(600, t0 + dur);
    filter.Q.value = 2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.4, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);

    // Sub-bass thump.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, t0);
    sub.frequency.exponentialRampToValueAtTime(50, t0 + dur);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t0);
    sg.gain.linearRampToValueAtTime(0.45, t0 + 0.008);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    sub.connect(sg);
    sg.connect(dest);
    sub.start(t0);
    sub.stop(t0 + dur + 0.05);
  }

  /** hover — crisp FM tick: carrier 2800 × mod 5600 (2:1 bell) + 4200 shimmer. Amp ≈0.05. */
  private playHover(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.08;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 2800;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = 5600;
    const modGain = ctx.createGain();
    modGain.gain.value = 1400; // modulation index
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    carrier.connect(g);
    g.connect(dest);
    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t0 + dur + 0.02);
    mod.stop(t0 + dur + 0.02);

    // 4200Hz shimmer.
    const shim = ctx.createOscillator();
    shim.type = 'sine';
    shim.frequency.value = 4200;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t0);
    sg.gain.linearRampToValueAtTime(0.03, t0 + 0.003);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    shim.connect(sg);
    sg.connect(dest);
    shim.start(t0);
    shim.stop(t0 + dur + 0.02);
  }

  /** select — two ascending FM beeps. */
  private playSelect(ctx: AudioContext, dest: AudioNode): void {
    const freqs = [880, 1320];
    freqs.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.07;
      const dur = 0.1;

      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.value = f;

      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = f * 2;
      const modGain = ctx.createGain();
      modGain.gain.value = f * 0.9;
      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      carrier.connect(g);
      g.connect(dest);
      carrier.start(t);
      mod.start(t);
      carrier.stop(t + dur + 0.02);
      mod.stop(t + dur + 0.02);
    });
  }

  /** place — sawtooth 1320→440Hz sweep, resonant filter. */
  private playPlace(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.35;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1320, t0);
    osc.frequency.exponentialRampToValueAtTime(440, t0 + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t0);
    filter.frequency.exponentialRampToValueAtTime(800, t0 + dur);
    filter.Q.value = 9; // resonant

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** deny — low square buzz 220→140Hz, waveshaper distortion, bitcrushed. */
  private playDeny(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.4;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(140, t0 + dur);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.makeDistortionCurve(40);
    shaper.oversample = '4x';

    const bitcrush = ctx.createWaveShaper();
    bitcrush.curve = this.makeBitcrushCurve(8); // 8 levels ≈ 3-bit
    bitcrush.oversample = 'none';

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.4, t0 + 0.01);
    g.gain.setValueAtTime(0.4, t0 + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(shaper);
    shaper.connect(bitcrush);
    bitcrush.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** notify — soft 1200Hz bell with shimmer harmonic. */
  private playNotify(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.5;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 1200;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = 2400;
    const modGain = ctx.createGain();
    modGain.gain.value = 600; // bell-like FM index
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    carrier.connect(g);
    g.connect(dest);
    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t0 + dur + 0.05);
    mod.stop(t0 + dur + 0.05);

    // Shimmer harmonic.
    const shim = ctx.createOscillator();
    shim.type = 'sine';
    shim.frequency.value = 3600;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t0);
    sg.gain.linearRampToValueAtTime(0.07, t0 + 0.012);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.8);
    shim.connect(sg);
    sg.connect(dest);
    shim.start(t0);
    shim.stop(t0 + dur + 0.05);
  }

  /** key — square blip ~1100Hz, short. */
  private playKey(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.05;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1100;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.2, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** tick — crisp FM pip (carrier 1800 × mod 3600). */
  private playTick(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.04;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 1800;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = 3600;
    const modGain = ctx.createGain();
    modGain.gain.value = 900;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.15, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    carrier.connect(g);
    g.connect(dest);
    carrier.start(t0);
    mod.start(t0);
    carrier.stop(t0 + dur + 0.02);
    mod.stop(t0 + dur + 0.02);
  }

  /** transition — filter-swept noise whoosh + sub thump. */
  private playTransition(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 0.5;

    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t0);
    filter.frequency.exponentialRampToValueAtTime(6000, t0 + dur * 0.7);
    filter.frequency.exponentialRampToValueAtTime(800, t0 + dur);
    filter.Q.value = 3;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.3, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    noise.connect(filter);
    filter.connect(g);
    g.connect(dest);
    noise.start(t0);
    noise.stop(t0 + dur + 0.05);

    // Sub thump.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, t0);
    sub.frequency.exponentialRampToValueAtTime(40, t0 + 0.2);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t0);
    sg.gain.linearRampToValueAtTime(0.55, t0 + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    sub.connect(sg);
    sg.connect(dest);
    sub.start(t0);
    sub.stop(t0 + 0.35);
  }

  /** ready — ethereal shimmer chime (high sine partials 2x–3x and beyond). */
  private playReady(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime;
    const dur = 1.2;
    const base = 880;
    const partials = [1, 2, 3, 4, 5];

    partials.forEach((p, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * p;

      const peak = 0.13 / (i + 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.06 + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(g);
      g.connect(dest);
      osc.start(t0 + i * 0.02);
      osc.stop(t0 + dur + 0.1);
    });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const n = 1024;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private makeBitcrushCurve(levels: number): Float32Array {
    const n = 1024;
    const curve = new Float32Array(n);
    const step = levels / 2;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.round(x * step) / step;
    }
    return curve;
  }
}

// Singleton — import this, never construct.
export const sfx = new SfxEngine();

export default sfx;

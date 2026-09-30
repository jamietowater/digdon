import type { GameEvent } from '../sim/events';

type Wave = OscillatorType;

/**
 * Procedural arcade sound effects: no audio files, so nothing to download. The context starts on the first
 * touch or key press (browsers block audio until then).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ufoOsc: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private engineOsc: { osc: OscillatorNode; gain: GainNode } | null = null;
  private muted = false;

  constructor() {
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, { passive: true });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  /** Stop everything at once when the host pauses the game. */
  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  private tone(freq: number, dur: number, wave: Wave, vol: number, slideTo = freq, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: number, type: BiquadFilterType = 'lowpass', delay = 0, sweepTo = filter): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private notes(freqs: number[], step: number, wave: Wave, vol: number): void {
    freqs.forEach((f, i) => this.tone(f, step * 1.6, wave, vol, f, i * step));
  }

  private ufo(active: boolean): void {
    const ctx = this.ctx;
    if (!active || !ctx || !this.master || ctx.state !== 'running') {
      if (this.ufoOsc) {
        this.ufoOsc.gain.gain.setTargetAtTime(0, ctx?.currentTime ?? 0, 0.05);
        const { osc, lfo } = this.ufoOsc;
        setTimeout(() => {
          osc.stop();
          lfo.stop();
        }, 300);
        this.ufoOsc = null;
      }
      return;
    }
    if (this.ufoOsc) return;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 520;
    lfo.frequency.value = 7;
    depth.gain.value = 120;
    lfo.connect(depth).connect(osc.frequency);
    gain.gain.value = 0.035;
    osc.connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.ufoOsc = { osc, lfo, gain };
  }

  /** The Level 7 engine drone: pitch follows speed (0 to 1); null stops it. */
  engine(speed: number | null): void {
    const ctx = this.ctx;
    if (speed === null || !ctx || !this.master || ctx.state !== 'running') {
      if (this.engineOsc) {
        const { osc, gain } = this.engineOsc;
        gain.gain.setTargetAtTime(0, ctx?.currentTime ?? 0, 0.05);
        setTimeout(() => osc.stop(), 300);
        this.engineOsc = null;
      }
      return;
    }
    if (!this.engineOsc) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      gain.gain.value = 0.05;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.engineOsc = { osc, gain };
    }
    this.engineOsc.osc.frequency.setTargetAtTime(50 + 130 * speed, ctx.currentTime, 0.05);
  }

  play(e: GameEvent): void {
    if (!this.ctx) return;
    switch (e.type) {
      case 'dig': this.noise(0.07, 0.18, 900, 'lowpass', 0, 300); break;
      case 'spray': this.noise(0.18, 0.2, 2400, 'bandpass', 0, 900); break;
      case 'mortarHit': this.noise(0.14, 0.3, 700, 'lowpass', 0, 200); this.tone(180, 0.12, 'sine', 0.2, 90); break;
      case 'crack': this.noise(0.04, 0.12, 3000, 'highpass'); break;
      case 'encaseKill': this.noise(0.3, 0.35, 1200, 'lowpass', 0, 150); this.notes([660, 880], 0.06, 'square', 0.06); break;
      case 'trowelThrow': this.noise(0.12, 0.12, 800, 'bandpass', 0, 3000); break;
      case 'trowelHit': this.tone(1900, 0.18, 'triangle', 0.14, 1700); break;
      case 'trowelKill': this.tone(2200, 0.2, 'triangle', 0.16, 1900); this.noise(0.1, 0.2, 1500); break;
      case 'rockWobble': for (let i = 0; i < 4; i++) this.noise(0.03, 0.12, 2500, 'bandpass', i * 0.12); break;
      case 'rockFall': this.tone(900, 0.45, 'sine', 0.08, 200); break;
      case 'rockLand': this.tone(70, 0.3, 'sine', 0.5, 40); this.noise(0.25, 0.3, 600, 'lowpass', 0, 100); break;
      case 'brickLaid': this.tone(110, 0.09, 'square', 0.14, 70); this.noise(0.05, 0.15, 500); break;
      case 'brickBroken': this.noise(0.18, 0.22, 1400, 'lowpass', 0, 200); break;
      case 'bomb': this.tone(700, 0.12, 'square', 0.04, 400); break;
      case 'fleetStep': this.tone([62, 58, 55, 52][e.beat], 0.1, 'square', 0.12, [62, 58, 55, 52][e.beat] * 0.9); break;
      case 'ufo': this.ufo(e.active); break;
      case 'ufoHit': this.notes([523, 659, 784, 1047, 1319], 0.05, 'square', 0.07); break;
      case 'bonusSpawn': this.notes([1047, 1319, 1568], 0.07, 'triangle', 0.1); break;
      case 'bonusCollect': this.notes([784, 988, 1175, 1568, 1976], 0.05, 'square', 0.07); break;
      case 'donJr': this.notes([392, 523, 659, 784, 1047], 0.08, 'square', 0.08); break;
      case 'ghost': this.tone(300, 0.6, 'sine', 0.07, 900); break;
      case 'brickThrow': this.noise(0.1, 0.15, 600, 'bandpass', 0, 2000); this.tone(220, 0.08, 'square', 0.05, 160); break;
      case 'canThrow': this.tone(1200, 0.3, 'sine', 0.05, 500); break;
      case 'raceHit': this.tone(2200, 0.2, 'triangle', 0.16, 1900); this.noise(0.18, 0.25, 1400, 'lowpass', 0, 200); break;
      case 'splat': this.noise(0.35, 0.4, 500, 'lowpass', 0, 120); this.tone(160, 0.2, 'sine', 0.2, 60); break;
      case 'crash': this.noise(0.6, 0.45, 1500, 'lowpass', 0, 80); this.tone(90, 0.5, 'sawtooth', 0.15, 35); this.engine(null); break;
      case 'playerDied': this.notes([784, 659, 523, 392, 262, 196], 0.08, 'square', 0.08); this.ufo(false); break;
      case 'levelStart': this.notes([523, 659, 784, 1047], 0.09, 'square', 0.07); break;
      case 'levelClear': this.notes([523, 659, 784, 1047, 784, 1047, 1319], 0.08, 'square', 0.08); this.ufo(false); break;
      case 'gameOver': this.notes([392, 370, 349, 330, 262], 0.18, 'triangle', 0.12); break;
      default: break;
    }
  }

  click(): void {
    this.ensure();
    void this.ctx?.resume();
    this.tone(880, 0.05, 'square', 0.05, 660);
  }
}

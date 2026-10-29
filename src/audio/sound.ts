import type { GameEvent } from '../core/game';

const MUTE_KEY = 'bomber.muted';

/** Note name (e.g. 'A4', 'C#5') → frequency in Hz. */
function hz(note: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) throw new Error(`bad note ${note}`);
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]]! + (m[2] ? 1 : 0);
  return 440 * 2 ** ((semis + (Number(m[3]) - 4) * 12) / 12);
}

// Original 4-bar loop in A minor, eighth notes ('-' = rest).
const BASS = 'A2 A2 E3 A2 A2 E3 A2 E3 F2 F2 C3 F2 F2 C3 F2 C3 G2 G2 D3 G2 G2 D3 G2 D3 E2 E2 B2 E2 E2 B2 G#2 B2'.split(' ');
const LEAD = 'A4 - C5 E5 - D5 C5 - A4 - G4 A4 - - - - F4 - A4 C5 - D5 C5 - A4 - G4 - E4 - - - G4 - B4 D5 - E5 D5 - B4 - A4 G4 - - - - E4 - G#4 B4 - D5 C5 - B4 - G#4 - E4 - - -'.split(' ');
const BPM = 150;
const EIGHTH = 60 / BPM / 2;

/** Procedural chiptune sound effects and music via WebAudio, no asset files. */
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private sfxBus?: GainNode;
  private musicOn = true;
  private sfxOn = true;
  private noiseBuffer?: AudioBuffer;
  private musicTimer?: number;
  private nextNoteTime = 0;
  private step = 0;
  muted: boolean;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MUTE_KEY);
    } catch {
      // Storage can be unavailable (private mode); default to sound on.
    }
    this.muted = stored === '1';
  }

  /** Browsers only allow audio after a user gesture, so call this from a key/click handler. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.applyBuses();
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, len);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Music and sound effects can be switched off separately (from Settings). */
  configure({ music, sfx }: { music: boolean; sfx: boolean }): void {
    this.musicOn = music;
    this.sfxOn = sfx;
    this.applyBuses();
  }

  private applyBuses(): void {
    if (this.musicBus) this.musicBus.gain.value = this.musicOn ? 1 : 0;
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
  }

  /** M key: silences everything, on top of the Settings toggles. */
  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Not persisted; fine.
    }
  }

  play(event: GameEvent | 'select'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (event) {
      case 'bomb':
        this.tone(220, t, 0.12, 'sine', 0.5, 70);
        break;
      case 'explosion':
        this.noise(t, 0.7, 0.7, 2500, 120);
        this.tone(90, t, 0.4, 'sine', 0.6, 35);
        break;
      case 'enemy-killed':
        this.arpeggio(['E5', 'G5', 'B5', 'E6'], t, 0.045, 'square', 0.15);
        break;
      case 'power-up':
        this.arpeggio(['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], t, 0.05, 'square', 0.15);
        break;
      case 'player-died':
        this.tone(700, t, 0.9, 'square', 0.18, 60);
        this.tone(705, t, 0.9, 'square', 0.12, 58);
        break;
      case 'exit-open':
        this.arpeggio(['A5', 'E6', 'A6'], t, 0.1, 'triangle', 0.35);
        break;
      case 'stage-start':
      case 'select':
        this.arpeggio(['A4', 'C5', 'E5', 'A5'], t, 0.08, 'square', 0.15);
        break;
      case 'stage-clear':
        this.arpeggio(['C5', 'E5', 'G5', 'C6', '-', 'G5', 'C6'], t, 0.11, 'square', 0.18, 0.2);
        break;
      case 'game-over':
        this.arpeggio(['A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'A3'], t, 0.18, 'triangle', 0.4, 0.25);
        break;
    }
  }

  startMusic(): void {
    if (!this.ctx || this.musicTimer !== undefined) return;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    // Schedule slightly ahead on a timer so timing stays tight even with frame hiccups.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer === undefined) return;
    clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      const bass = BASS[this.step % BASS.length];
      this.tone(hz(bass), this.nextNoteTime, EIGHTH * 0.9, 'triangle', 0.28, undefined, this.musicBus);
      const lead = LEAD[this.step % LEAD.length];
      if (lead !== '-') this.tone(hz(lead), this.nextNoteTime, EIGHTH * 0.8, 'square', 0.05, undefined, this.musicBus);
      this.nextNoteTime += EIGHTH;
      this.step++;
    }
  }

  private tone(
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    out = this.sfxBus,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain).connect(out!);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, vol: number, fromHz: number, toHz: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fromHz, start);
    filter.frequency.exponentialRampToValueAtTime(toHz, start + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(filter).connect(gain).connect(this.sfxBus!);
    src.start(start);
    src.stop(start + dur);
  }

  private arpeggio(
    notes: string[],
    start: number,
    step: number,
    type: OscillatorType,
    vol: number,
    lastDur = step * 1.5,
  ): void {
    notes.forEach((n, i) => {
      if (n === '-') return;
      const dur = i === notes.length - 1 ? lastDur : step * 1.2;
      this.tone(hz(n), start + i * step, dur, type, vol);
    });
  }
}

/** Shared instance: one AudioContext for the whole game. */
export const sound = new Sound();

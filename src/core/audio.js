// Fully synthesized sound — no audio files, no network. A tiny WebAudio synth with a
// handful of SFX. The looping background music lives in ./music.js (Music). The
// context is created lazily and resumed on first user gesture (autoplay-policy safe).

import { Music } from "./music.js";

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;       // master mute (all sound)
    this.musicMuted = false;  // music-only mute
    this.music = null;        // lazily-created Music instance
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  // Call from a user gesture to satisfy autoplay policies.
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // Music-only mute — independent of the master mute above.
  setMusicMuted(m) {
    this.musicMuted = m;
    if (this.music) this.music.setMuted(m);
  }
  toggleMusicMute() { this.setMusicMuted(!this.musicMuted); return this.musicMuted; }

  // Core voice: an oscillator with a frequency ramp + a percussive gain envelope.
  _tone(type, f0, f1, dur, gain = 0.3, dest = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A shared 1s white-noise buffer, generated once and reused for every SFX burst.
  // Buffers are immutable and safe to share across overlapping sources, so this avoids
  // allocating + filling a fresh buffer (with a Math.random loop) on every hit.
  _noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const sr = this.ctx.sampleRate;
    const len = sr | 0; // 1 second
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  _noise(dur, gain = 0.3, filterFreq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const buf = this._noiseBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    // Percussive decay via a gain ramp (was baked per-sample into the buffer).
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.master);
    // Play a random slice so repeats don't sound identical.
    src.start(t, Math.random() * Math.max(0.001, buf.duration - dur), dur);
  }

  jump() { this._tone("square", 320, 620, 0.16, 0.22); }
  land() { this._tone("sine", 180, 70, 0.14, 0.4); this._noise(0.08, 0.12, 800); }
  step() { this._tone("sine", 140, 60, 0.06, 0.30); this._noise(0.035, 0.045, 650); }
  bone() { this._tone("square", 880, 880, 0.06, 0.2); setTimeout(() => this._tone("square", 1320, 1320, 0.09, 0.2), 60); }
  death() { this._tone("sawtooth", 400, 60, 0.9, 0.3); this._noise(0.5, 0.2, 900); }
  shoot() { this._tone("square", 700, 1250, 0.12, 0.18); }
  enemyShoot() { this._tone("sawtooth", 300, 150, 0.16, 0.15); }
  enemyHit() { this._tone("square", 520, 90, 0.22, 0.22); this._noise(0.12, 0.14, 700); }
  crack() { this._tone("square", 220, 180, 0.05, 0.14); this._noise(0.05, 0.08, 1600); }
  crumble() { this._tone("sawtooth", 160, 50, 0.35, 0.22); this._noise(0.3, 0.2, 500); }
  bossSlam() { this._tone("sawtooth", 110, 40, 0.4, 0.3); this._noise(0.35, 0.24, 400); }

  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this._tone("sawtooth", f, f, 0.9, 0.2), i * 110));
  }

  // ~5s triumphant fanfare played when the boss is defeated: a rising call, an answer a
  // third higher, then a held C-major chord with a sparkle tail. Each entry is
  // [freq, startSec, durSec, gain, waveform].
  bossVictory() {
    if (!this.ctx || this.muted) return;
    const N = { C5: 523, E5: 659, G5: 784, B5: 988, C6: 1047, D6: 1175, E6: 1319, G6: 1568 };
    const seq = [
      // fanfare call
      [N.C5, 0.00, 0.14, 0.20, "square"],
      [N.E5, 0.14, 0.14, 0.20, "square"],
      [N.G5, 0.28, 0.14, 0.20, "square"],
      [N.C6, 0.42, 0.34, 0.24, "square"],
      [N.G5, 0.78, 0.14, 0.18, "square"],
      [N.C6, 0.92, 0.50, 0.24, "square"],
      // answer, a third higher
      [N.E5, 1.60, 0.14, 0.20, "square"],
      [N.G5, 1.74, 0.14, 0.20, "square"],
      [N.B5, 1.88, 0.14, 0.20, "square"],
      [N.E6, 2.02, 0.34, 0.24, "square"],
      [N.D6, 2.40, 0.14, 0.18, "square"],
      [N.E6, 2.54, 0.60, 0.24, "square"],
      // final held major chord + octave sparkle (rings out to ~4.9s)
      [N.C5, 3.30, 1.60, 0.16, "sawtooth"],
      [N.E5, 3.30, 1.60, 0.14, "sawtooth"],
      [N.G5, 3.30, 1.60, 0.14, "sawtooth"],
      [N.C6, 3.30, 1.60, 0.16, "triangle"],
      [N.G6, 3.40, 1.30, 0.10, "sine"],
      [N.E6, 4.00, 1.00, 0.10, "triangle"],
    ];
    for (const [f, t, d, g, type] of seq) {
      setTimeout(() => this._tone(type, f, f, d, g), t * 1000);
    }
    // Percussive accents under the two fanfare peaks.
    setTimeout(() => this._noise(0.12, 0.10, 3000), 420);
    setTimeout(() => this._noise(0.12, 0.10, 3000), 2020);
  }

  // Bright three-note chime + shimmer tail for an unlocked achievement (Steam-ish).
  achievement() {
    const notes = [784, 1047, 1319]; // G5 · C6 · E6
    notes.forEach((f, i) => setTimeout(() => this._tone("triangle", f, f, 0.5, 0.2), i * 95));
    setTimeout(() => this._tone("sine", 1568, 1568, 0.7, 0.1), 300); // sparkle
  }

  // --- Background music -------------------------------------------------------
  // Delegated to the Music sequencer in ./music.js. It shares this synth's audio
  // context and plays into the master bus, so the mute toggle silences it too.

  startMusic() {
    if (!this.ctx) return;
    if (!this.music) this.music = new Music(this.ctx, this.master);
    this.music.setMuted(this.musicMuted);
    this.music.start();
  }

  stopMusic() {
    if (this.music) this.music.stop();
  }
}

// Fully synthesized sound — no audio files, no network. A tiny WebAudio synth with a
// handful of SFX plus a procedural chiptune loop. The context is created lazily and
// resumed on first user gesture (autoplay-policy safe).

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._music = null;      // { step, nextTime }
    this._musicTimer = null; // setInterval id for the note scheduler
    this._musicGain = null;
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

  _noise(dur, gain = 0.3, filterFreq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(flt).connect(g).connect(this.master);
    src.start(t);
  }

  jump() { this._tone("square", 320, 620, 0.16, 0.22); }
  land() { this._tone("sine", 180, 70, 0.14, 0.28); this._noise(0.08, 0.12, 800); }
  bone() { this._tone("square", 880, 880, 0.06, 0.2); setTimeout(() => this._tone("square", 1320, 1320, 0.09, 0.2), 60); }
  death() { this._tone("sawtooth", 400, 60, 0.5, 0.3); this._noise(0.4, 0.2, 900); }

  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this._tone("triangle", f, f, 0.18, 0.25), i * 110));
  }

  // --- Chiptune background music --------------------------------------------
  // A looping NES-style groove built from oscillators + noise: a pulse-wave
  // arpeggio, a bass line, and drums, over an Am–F–C–G progression. Scheduled with
  // the standard Web Audio lookahead pattern so it stays rock-solid regardless of
  // frame rate. Everything runs through a dedicated gain into the master bus, so the
  // mute toggle silences it too.
  startMusic() {
    if (!this.ctx || this._music) return;
    this._musicGain = this.ctx.createGain();
    this._musicGain.gain.value = 0.5;
    this._musicGain.connect(this.master);

    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const tempo = 140;
    const step16 = 60 / tempo / 4; // seconds per sixteenth note
    // One entry per bar: arpeggio chord tones + bass root (MIDI numbers).
    const prog = [
      { arp: [57, 60, 64], bass: 45 }, // Am
      { arp: [53, 57, 60], bass: 41 }, // F
      { arp: [55, 60, 64], bass: 48 }, // C
      { arp: [55, 59, 62], bass: 43 }, // G
    ];
    const arpOrder = [0, 1, 2, 1]; // up-down arpeggio
    const TOTAL = 64; // 4 bars × 16 steps

    const scheduleStep = (step, t) => {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const chord = prog[bar];
      // Arpeggio — a short bright pulse note on every sixteenth.
      const arp = chord.arp[arpOrder[step % arpOrder.length]] + 12;
      this._note("square", midi(arp), t, step16 * 0.9, 0.16, this._musicGain);
      // Bass — triangle on eighth notes, jumping to the octave mid-bar.
      if (s % 2 === 0) {
        const bn = s % 8 === 4 ? chord.bass + 12 : chord.bass;
        this._note("triangle", midi(bn), t, step16 * 1.8, 0.34, this._musicGain);
      }
      // Drums.
      if (s === 0 || s === 8) this._kick(t);
      if (s === 4 || s === 12) this._drumNoise(t, 0.12, 0.16, "highpass", 1400);
      if (s % 2 === 1) this._drumNoise(t, 0.03, 0.06, "highpass", 6000);
    };

    this._music = { step: 0, nextTime: this.ctx.currentTime + 0.08 };
    const lookahead = 0.12;
    this._musicTimer = setInterval(() => {
      if (!this.ctx || !this._music) return;
      while (this._music.nextTime < this.ctx.currentTime + lookahead) {
        scheduleStep(this._music.step, this._music.nextTime);
        this._music.nextTime += step16;
        this._music.step = (this._music.step + 1) % TOTAL;
      }
    }, 25);
  }

  stopMusic() {
    if (this._musicTimer) clearInterval(this._musicTimer);
    this._musicTimer = null;
    this._music = null;
    if (this._musicGain) {
      const g = this._musicGain;
      // fade out so already-scheduled notes don't click, then drop it
      try {
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
        setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 400);
      } catch (e) {}
      this._musicGain = null;
    }
  }

  // A music note at an absolute time `t` (constant pitch, percussive envelope).
  // Unlike the SFX helpers it doesn't early-out on mute — muting is handled by the
  // master gain, so the loop keeps its timing and unmutes seamlessly.
  _note(type, freq, t, dur, gain, dest) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _kick(t) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.11);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g).connect(this._musicGain || this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // Filtered noise burst at absolute time `t` — used for snare/hat.
  _drumNoise(t, dur, gain, filterType, freq) {
    if (!this.ctx) return;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(flt).connect(g).connect(this._musicGain || this.master);
    src.start(t);
  }
}

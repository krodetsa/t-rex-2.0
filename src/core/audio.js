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
  this._musicGain.gain.value = 0.45;
  this._musicGain.connect(this.master);

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const tempo = 140;
  const step16 = 60 / tempo / 4;

  // ------------------------------------------------------------
  // CHORD / HARMONY DATA
  // ------------------------------------------------------------

  const chords = {
    Am: { tones: [57, 60, 64], bass: 45 },
    F:  { tones: [53, 57, 60], bass: 41 },
    C:  { tones: [55, 60, 64], bass: 48 },
    G:  { tones: [55, 59, 62], bass: 43 },

    Dm: { tones: [50, 53, 57], bass: 38 },
    Em: { tones: [52, 55, 59], bass: 40 },
    E:  { tones: [52, 56, 59], bass: 40 },
  };

  // 32 bars total
  const sections = [
    // INTRO — 4 bars
    {
      type: "intro",
      progression: ["Am", "F", "C", "G"],
    },

    // A — 8 bars
    {
      type: "A",
      progression: [
        "Am", "F", "C", "G",
        "Am", "F", "C", "G",
      ],
    },

    // B — 8 bars
    {
      type: "B",
      progression: [
        "Am", "F", "C", "G",
        "Am", "F", "C", "E",
      ],
    },

    // BREAKDOWN — 4 bars
    {
      type: "break",
      progression: ["Am", "F", "C", "G"],
    },

    // A2 — 8 bars
    {
      type: "A2",
      progression: [
        "Am", "F", "C", "G",
        "Am", "F", "C", "G",
      ],
    },
  ];

  const bars = sections.flatMap(section =>
    section.progression.map((chord, index) => ({
      chord,
      section: section.type,
      sectionBar: index,
    }))
  );

  const TOTAL_STEPS = bars.length * 16;

  // ------------------------------------------------------------
  // MELODIES
  //
  // null = rest
  // Values are MIDI notes.
  // Each array = one bar, 16 sixteenth-note steps.
  // ------------------------------------------------------------

  const melodyA = [
    // bar 1
    [69, null, 72, null, 76, null, 72, 74,
     76, null, 79, null, 76, 74, 72, null],

    // bar 2
    [69, null, 72, 74, 72, null, 69, null,
     65, null, 69, null, 72, 69, 67, null],

    // bar 3
    [67, null, 72, null, 76, 79, 76, null,
     72, null, 76, null, 79, 81, 79, null],

    // bar 4
    [74, null, 71, null, 67, null, 71, 74,
     79, null, 78, 76, 74, null, 71, null],
  ];

  const melodyB = [
    [74, null, 77, null, 81, 79, 77, null,
     74, 77, 81, null, 84, null, 81, null],

    [72, null, 76, 79, 81, null, 79, 76,
     72, null, 69, null, 72, 76, 74, null],

    [77, null, 81, null, 84, null, 81, 79,
     77, 76, 74, null, 72, null, 69, null],

    [71, null, 74, null, 76, 78, 79, null,
     83, null, 81, 79, 78, 76, 74, null],
  ];

  // Faster final variation
  const melodyA2 = [
    [81, 79, 76, 72, 76, 79, 81, 84,
     81, 79, 76, 74, 72, 74, 76, 79],

    [81, null, 77, 76, 72, 69, 72, 76,
     77, 76, 72, 69, 65, 69, 72, null],

    [79, 76, 72, 67, 72, 76, 79, 84,
     83, 79, 76, 72, 76, 79, 81, 83],

    [79, 78, 74, 71, 74, 78, 79, 83,
     81, 79, 78, 76, 74, 71, 67, null],
  ];

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------

  const playPulse = (
    note,
    t,
    duration = step16 * 0.85,
    volume = 0.12
  ) => {
    if (note == null) return;

    this._note(
      "square",
      midi(note),
      t,
      duration,
      volume,
      this._musicGain
    );
  };

  const playBass = (note, t, duration, volume = 0.28) => {
    this._note(
      "triangle",
      midi(note),
      t,
      duration,
      volume,
      this._musicGain
    );
  };

  // ------------------------------------------------------------
  // STEP SCHEDULER
  // ------------------------------------------------------------

  const scheduleStep = (step, t) => {
    const barIndex = Math.floor(step / 16);
    const s = step % 16;

    const bar = bars[barIndex];
    const chord = chords[bar.chord];

    // ==========================================================
    // INTRO
    // ==========================================================

    if (bar.section === "intro") {
      // Sparse arpeggio
      if (s % 2 === 0) {
        const arpIndex = [0, 1, 2, 1][(s / 2) % 4];
        const note = chord.tones[arpIndex] + 12;

        playPulse(
          note,
          t,
          step16 * 1.7,
          0.10
        );
      }

      // Bass enters after first bar
      if (bar.sectionBar > 0 && s % 4 === 0) {
        playBass(
          chord.bass,
          t,
          step16 * 3.5,
          0.22
        );
      }

      if (s === 0) this._kick(t);

      if (bar.sectionBar >= 2 && (s === 4 || s === 12)) {
        this._drumNoise(
          t,
          0.1,
          0.12,
          "highpass",
          1600
        );
      }

      return;
    }

    // ==========================================================
    // SECTION A
    // ==========================================================

    if (bar.section === "A") {
      const pattern =
        melodyA[bar.sectionBar % melodyA.length];

      playPulse(pattern[s], t, step16 * 0.82, 0.13);

      // Secondary pulse arpeggio
      if (s % 2 === 0) {
        const arpOrder = [0, 1, 2, 1];
        const note =
          chord.tones[
            arpOrder[(s / 2) % arpOrder.length]
          ] + 12;

        playPulse(
          note,
          t,
          step16 * 0.75,
          0.055
        );
      }

      // NES-style triangle bass
      if (s % 2 === 0) {
        const bassPattern = [
          0, 0, 12, 0,
          0, 12, 7, 12,
        ];

        const offset = bassPattern[s / 2];

        playBass(
          chord.bass + offset,
          t,
          step16 * 1.7,
          0.25
        );
      }

      // Drums
      if (s === 0 || s === 8) this._kick(t);

      if (s === 4 || s === 12) {
        this._drumNoise(
          t,
          0.11,
          0.15,
          "highpass",
          1500
        );
      }

      if (s % 2 === 1) {
        this._drumNoise(
          t,
          0.025,
          0.035,
          "highpass",
          6500
        );
      }

      return;
    }

    // ==========================================================
    // SECTION B
    // ==========================================================

    if (bar.section === "B") {
      const pattern =
        melodyB[bar.sectionBar % melodyB.length];

      playPulse(pattern[s], t, step16 * 0.78, 0.14);

      // More active counter-arpeggio
      const arpOrder = [0, 2, 1, 2];

      if (s % 2 === 1) {
        const note =
          chord.tones[
            arpOrder[Math.floor(s / 2) % 4]
          ] + 12;

        playPulse(
          note,
          t,
          step16 * 0.7,
          0.06
        );
      }

      // Walking bass
      if (s % 2 === 0) {
        const walk = [0, 7, 12, 7, 0, 7, 10, 12];

        playBass(
          chord.bass + walk[s / 2],
          t,
          step16 * 1.6,
          0.27
        );
      }

      if (s === 0 || s === 6 || s === 8) {
        this._kick(t);
      }

      if (s === 4 || s === 12) {
        this._drumNoise(
          t,
          0.13,
          0.17,
          "highpass",
          1300
        );
      }

      // faster hats
      if (s % 2 === 1 || s === 14) {
        this._drumNoise(
          t,
          0.025,
          0.045,
          "highpass",
          7000
        );
      }

      return;
    }

    // ==========================================================
    // BREAKDOWN
    // ==========================================================

    if (bar.section === "break") {
      // Heavy sparse bass
      if ([0, 3, 6, 8, 11, 14].includes(s)) {
        const octave = s >= 8 ? 12 : 0;

        playBass(
          chord.bass + octave,
          t,
          step16 * 1.8,
          0.34
        );

        this._kick(t);
      }

      // Sparse high pulse stabs
      if (s === 4 || s === 12) {
        playPulse(
          chord.tones[2] + 24,
          t,
          step16 * 1.5,
          0.11
        );
      }

      if (s === 4 || s === 12) {
        this._drumNoise(
          t,
          0.16,
          0.20,
          "highpass",
          1100
        );
      }

      return;
    }

    // ==========================================================
    // FINAL A2
    // ==========================================================

    if (bar.section === "A2") {
      const pattern =
        melodyA2[bar.sectionBar % melodyA2.length];

      playPulse(pattern[s], t, step16 * 0.7, 0.14);

      // Constant 16th-note arpeggio underneath
      const arpOrder = [0, 1, 2, 1];

      const arpNote =
        chord.tones[
          arpOrder[s % arpOrder.length]
        ] + 12;

      playPulse(
        arpNote,
        t,
        step16 * 0.55,
        0.045
      );

      // Energetic bass
      if (s % 2 === 0) {
        const bassPattern = [
          0, 12, 7, 12,
          0, 12, 10, 7,
        ];

        playBass(
          chord.bass + bassPattern[s / 2],
          t,
          step16 * 1.5,
          0.29
        );
      }

      if (
        s === 0 ||
        s === 3 ||
        s === 8 ||
        s === 10
      ) {
        this._kick(t);
      }

      if (s === 4 || s === 12) {
        this._drumNoise(
          t,
          0.12,
          0.18,
          "highpass",
          1400
        );
      }

      // constant hats
      if (s % 2 === 1) {
        this._drumNoise(
          t,
          0.022,
          0.045,
          "highpass",
          7200
        );
      }
    }
  };

  // ------------------------------------------------------------
  // SCHEDULER
  // ------------------------------------------------------------

  this._music = {
    step: 0,
    nextTime: this.ctx.currentTime + 0.08,
  };

  const lookahead = 0.12;

  this._musicTimer = setInterval(() => {
    if (!this.ctx || !this._music) return;

    while (
      this._music.nextTime <
      this.ctx.currentTime + lookahead
    ) {
      scheduleStep(
        this._music.step,
        this._music.nextTime
      );

      this._music.nextTime += step16;

      this._music.step =
        (this._music.step + 1) % TOTAL_STEPS;
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

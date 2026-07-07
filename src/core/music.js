// Procedural chiptune/metal background music — a tiny step-sequencer synth.
// No audio files: everything is oscillators + filtered noise scheduled on the
// Web Audio clock. A `Music` instance owns its own gain bus (so the mute toggle
// on the master silences it too), a distorted "metal" guitar bus, and a
// lookahead scheduler that walks a 16-step-per-bar song arrangement.
//
// Usage:
//   const music = new Music(ctx, masterGain);
//   music.start();   // idempotent while playing
//   music.stop();    // fades out and tears the bus down

// Base level of the music sub-mix. `setMuted(true)` drops it to 0 without
// touching the master bus, so music can be silenced independently of SFX.
const VOLUME = 0.58;

export class Music {
  // `ctx`         — a live AudioContext
  // `destination` — the node to play into (usually the master gain)
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.muted = false;
    this._playing = null;    // { step, nextTime }
    this._timer = null;      // setInterval id for the note scheduler
    this._gain = null;       // dedicated music sub-mix into `destination`
    this._metalBus = null;   // distorted guitar bus
  }

  get playing() { return !!this._playing; }

  // Silence just the music (independent of the master mute). Keeps the loop
  // running so timing stays intact and unmutes seamlessly.
  setMuted(m) {
    this.muted = m;
    if (this._gain) this._gain.gain.value = m ? 0 : VOLUME;
  }

  // --- Distorted guitar bus --------------------------------------------------
  _initMetalBus(destination = this.destination) {
    if (!this.ctx) return;

    // Reuse existing bus if already created.
    if (this._metalBus) return;

    // ------------------------------------------------------------
    // PREAMP
    // ------------------------------------------------------------

    const input = this.ctx.createGain();
    input.gain.value = 0.7;

    // ------------------------------------------------------------
    // DISTORTION
    // ------------------------------------------------------------

    const distortion = this.ctx.createWaveShaper();

    const samples = 4096;
    const curve = new Float32Array(samples);
    const amount = 110;

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // Softer asymmetric-ish saturation than before.
      curve[i] =
        Math.tanh(x * 3.5) * 0.82 +
        Math.tanh(x * amount * 0.015) * 0.18;
    }

    distortion.curve = curve;
    distortion.oversample = "4x";

    // ------------------------------------------------------------
    // LOW CUT
    // Leave true low end to triangle/sub bass.
    // ------------------------------------------------------------

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 85;
    highpass.Q.value = 0.7;

    // ------------------------------------------------------------
    // BODY
    // ------------------------------------------------------------

    const body = this.ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 720;
    body.Q.value = 0.9;
    body.gain.value = 3.5;

    // ------------------------------------------------------------
    // REMOVE HARSH FIZZ
    // ------------------------------------------------------------

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 4300;
    lowpass.Q.value = 0.8;

    // ------------------------------------------------------------
    // OUTPUT
    // ------------------------------------------------------------

    const output = this.ctx.createGain();
    output.gain.value = 0.72;

    input.connect(distortion);
    distortion.connect(highpass);
    highpass.connect(body);
    body.connect(lowpass);
    lowpass.connect(output);
    output.connect(destination);

    this._metalBus = {
      input,
      distortion,
      highpass,
      body,
      lowpass,
      output,
    };
  }

  _metalNote(frequency, t, duration, volume = 0.16) {
    if (!this.ctx || !this._metalBus) return;

    const envelope = this.ctx.createGain();

    envelope.gain.setValueAtTime(0.0001, t);

    envelope.gain.exponentialRampToValueAtTime(
      Math.max(volume, 0.0001),
      t + 0.004
    );

    // Less abrupt decay than previous version.
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(volume * 0.72, 0.0001),
      t + Math.min(duration * 0.35, 0.07)
    );

    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      t + duration
    );

    envelope.connect(this._metalBus.input);

    // Two oscillators are enough.
    // Fewer oscillators = less mush.
    const voices = [
      { detune: -6, gain: 0.48 },
      { detune:  6, gain: 0.48 },
    ];

    voices.forEach(({ detune, gain }) => {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(frequency, t);
      osc.detune.setValueAtTime(detune, t);

      oscGain.gain.value = gain;

      osc.connect(oscGain);
      oscGain.connect(envelope);

      osc.start(t);
      osc.stop(t + duration + 0.03);
    });
  }

  // --- Transport -------------------------------------------------------------
  start() {
    if (!this.ctx || this._playing) return;

    this._gain = this.ctx.createGain();
    this._gain.gain.value = this.muted ? 0 : VOLUME;
    this._gain.connect(this.destination);

    this._initMetalBus(this._gain);

    const tempo = 148;
    const step16 = 60 / tempo / 4;

    // ============================================================
    // NOTE HELPERS
    // ============================================================

    const NOTE_MAP = {
      C: 0,
      "C#": 1,
      Db: 1,
      D: 2,
      "D#": 3,
      Eb: 3,
      E: 4,
      F: 5,
      "F#": 6,
      Gb: 6,
      G: 7,
      "G#": 8,
      Ab: 8,
      A: 9,
      "A#": 10,
      Bb: 10,
      B: 11,
    };

    const noteToMidi = (note) => {
      if (typeof note === "number") return note;
      if (!note) return null;

      const match = note.match(/^([A-G](?:#|b)?)(-?\d+)$/);

      if (!match) {
        console.warn(`Invalid note: ${note}`);
        return null;
      }

      const [, name, octaveString] = match;
      const octave = Number(octaveString);

      return (octave + 1) * 12 + NOTE_MAP[name];
    };

    const midi = (n) =>
      440 * Math.pow(2, (n - 69) / 12);

    const frequency = (note) => {
      const midiNote = noteToMidi(note);
      return midi(midiNote);
    };

    // ============================================================
    // SHORTCUTS
    // ============================================================

    const _ = null;

    // Drum hit
    const x = 1;

    // Accented drum hit
    const X = 2;

    // ============================================================
    // SONG DATA
    //
    // Every row = 1 bar
    // Every bar = 16 sixteenth-note steps
    //
    // _ = silence
    // x = normal drum hit
    // X = accented drum hit
    // ============================================================

    const song = {
      // ==========================================================
      // INTRO — 4 bars
      // ==========================================================

      intro: {
        guitar: [
          [
            "E2", _, _, _,
            _, _, _, _,
            _, _, _, _,
            _, _, _, _,
          ],

          [
            "E2", _, _, _,
            _, _, _, _,
            _, _, "Bb2", _,
            _, _, _, _,
          ],

          [
            "E2", _, _, _,
            _, _, _, _,
            _, _, "Bb2", _,
            _, _, _, _,
          ],

          [
            "E2", _, _, _,
            _, _, _, _,
            _, _, "Bb2", _,
            _, _, "E2", _,
          ],
        ],

        sub: [
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],

        kick: [
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, x],
        ],

        snare: [
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
        ],

        hat: [
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
        ],

        crash: [
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],
      },

      // ==========================================================
      // RIFF A — 4 bars
      // ==========================================================

      riffA: {
        guitar: [
          [
            "E2", _, _, "E2",
            _, _, "Bb2", _,
            "E2", _, _, _,
            "G2", _, "F2", _,
          ],

          [
            "E2", _, _, "E2",
            _, _, "Bb2", _,
            "E2", _, _, _,
            "B2", "Bb2", _, _,
          ],

          [
            "E2", _, _, "E2",
            _, _, "Bb2", _,
            "E2", _, _, _,
            "G2", _, "F2", _,
          ],

          [
            "E2", _, _, _,
            "Bb2", _, _, "E2",
            _, _, "G2", _,
            "F2", _, "E2", _,
          ],
        ],

        sub: [
          ["E1", _, _, _, _, _, _, _, "E1", _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, "E1", _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, "E1", _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],

        kick: [
          [X, _, _, _, _, _, _, x, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, _, x, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, _, x, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, x, _, _, _, x, _, _, _, _, _],
        ],

        snare: [
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
        ],

        hat: [
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
        ],

        crash: [
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],
      },

      // ==========================================================
      // RIFF B — 4 bars
      // More mechanical
      // ==========================================================

      riffB: {
        guitar: [
          [
            "E2", _, "E2", _,
            _, _, "Bb2", _,
            "E2", _, "E2", _,
            _, "G2", _, _,
          ],

          [
            "E2", _, "E2", _,
            _, _, "C3", "B2",
            "Bb2", _, _, _,
            "G2", _, "F2", _,
          ],

          [
            "E2", _, "E2", _,
            _, _, "Bb2", _,
            "E2", _, "E2", _,
            _, "G2", _, _,
          ],

          [
            "E2", _, _, _,
            "Bb2", _, "E2", _,
            _, _, "C3", "B2",
            "Bb2", "G2", "F2", _,
          ],
        ],

        sub: [
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],

        kick: [
          [X, _, _, _, _, _, x, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, x, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, x, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, x, _, _, _, x, _, _, _, _, _],
        ],

        snare: [
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
          [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
        ],

        hat: [
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
          [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
        ],

        crash: [
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],
      },

      // ==========================================================
      // BREAKDOWN — 4 bars
      // ==========================================================

      breakdown: {
        guitar: [
          [
            "E2", _, _, _,
            _, _, "Bb2", _,
            _, _, "E2", _,
            _, _, _, _,
          ],

          [
            "E2", _, _, _,
            _, _, _, _,
            "C3", _, "B2", _,
            "Bb2", _, _, _,
          ],

          [
            "E2", _, _, _,
            _, _, "Bb2", _,
            _, _, "E2", _,
            _, _, _, _,
          ],

          [
            "E2", _, _, _,
            "Bb2", _, _, _,
            "G2", _, _, _,
            "F2", _, "E2", _,
          ],
        ],

        sub: [
          ["E1", _, _, _, _, _, _, _, _, _, "E1", _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, "E1", _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],

        kick: [
          [X, _, _, _, _, _, _, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],

        snare: [
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
        ],

        hat: [
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
        ],

        crash: [
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],
      },

      // ==========================================================
      // RIFF C — 4 bars
      // Half-time
      // ==========================================================

      riffC: {
        guitar: [
          [
            "E2", _, _, _,
            "E2", _, _, _,
            "Bb2", _, _, _,
            "G2", _, _, _,
          ],

          [
            "E2", _, _, _,
            "E2", _, _, _,
            "C3", _, "B2", _,
            "Bb2", _, _, _,
          ],

          [
            "E2", _, _, _,
            "E2", _, _, _,
            "Bb2", _, _, _,
            "F2", _, _, _,
          ],

          [
            "E2", _, _, _,
            "Bb2", _, _, _,
            "G2", _, _, _,
            "F2", _, "E2", _,
          ],
        ],

        sub: [
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          ["E1", _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],

        kick: [
          [X, _, _, _, _, _, _, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, x, _, _, _, _, _],
          [X, _, _, _, _, _, _, _, _, _, x, _, _, _, _, _],
        ],

        snare: [
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
        ],

        hat: [
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
          [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
        ],

        crash: [
          [X, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
          [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        ],
      },
    };

    // ============================================================
    // ARRANGEMENT
    //
    // Here you control the whole song structure.
    // ============================================================

    const arrangement = [
      "intro",

      "riffA",
      "riffA",

      "riffB",
      "riffB",

      "breakdown",

      "riffC",
      "riffC",

      "riffA",

      "breakdown",

      "riffC",
      "riffC",
    ];

    // ============================================================
    // BUILD TIMELINE
    // ============================================================

    const timeline = [];

    arrangement.forEach(sectionName => {
      const section = song[sectionName];

      if (!section) {
        console.warn(`Unknown section: ${sectionName}`);
        return;
      }

      const barCount = Math.max(
        ...Object.values(section)
          .filter(Array.isArray)
          .map(track => track.length)
      );

      for (let bar = 0; bar < barCount; bar++) {
        timeline.push({
          sectionName,
          section,
          bar,
        });
      }
    });

    const TOTAL_STEPS = timeline.length * 16;

    // ============================================================
    // GET EVENT
    // ============================================================

    const getEvent = (
      section,
      trackName,
      barIndex,
      step
    ) => {
      const track = section[trackName];

      if (!track || !track.length) {
        return null;
      }

      const bar =
        track[barIndex % track.length];

      if (!bar) {
        return null;
      }

      return bar[step] ?? null;
    };

    // ============================================================
    // NOTE DURATION
    //
    // Hold note until next note in same bar.
    // ============================================================

    const getDuration = (
      section,
      trackName,
      barIndex,
      step,
      maxSteps = 6
    ) => {
      const track = section[trackName];

      if (!track || !track.length) {
        return step16;
      }

      const bar =
        track[barIndex % track.length];

      if (!bar) {
        return step16;
      }

      let steps = 1;

      for (
        let i = step + 1;
        i < Math.min(16, step + maxSteps);
        i++
      ) {
        if (bar[i] != null) break;
        steps++;
      }

      return step16 * steps * 0.88;
    };

    // ============================================================
    // PLAY DRUM EVENT
    // ============================================================

    const drumVolume = (
      value,
      normal,
      accent
    ) => {
      if (value === X) return accent;
      if (value === x) return normal;
      return 0;
    };

    // ============================================================
    // STEP SCHEDULER
    // ============================================================

    const scheduleStep = (step, t) => {
      const timelineBar =
        Math.floor(step / 16);

      const s = step % 16;

      const current =
        timeline[timelineBar];

      if (!current) return;

      const {
        section,
        bar,
      } = current;

      // ----------------------------------------------------------
      // GUITAR
      // ----------------------------------------------------------

      const guitarNote = getEvent(
        section,
        "guitar",
        bar,
        s
      );

      if (guitarNote != null) {
        const duration = getDuration(
          section,
          "guitar",
          bar,
          s,
          6
        );

        this._metalNote(
          frequency(guitarNote),
          t,
          duration,
          0.19
        );
      }

      // ----------------------------------------------------------
      // SUB
      // ----------------------------------------------------------

      const subNote = getEvent(
        section,
        "sub",
        bar,
        s
      );

      if (subNote != null) {
        const duration = getDuration(
          section,
          "sub",
          bar,
          s,
          8
        );

        this._note(
          "triangle",
          frequency(subNote),
          t,
          duration,
          0.13,
          this._gain
        );
      }

      // ----------------------------------------------------------
      // KICK
      // ----------------------------------------------------------

      const kickEvent = getEvent(
        section,
        "kick",
        bar,
        s
      );

      if (kickEvent) {
        this._kick(
          t,
          drumVolume(
            kickEvent,
            0.75,
            1
          )
        );
      }

      // ----------------------------------------------------------
      // SNARE
      // ----------------------------------------------------------

      const snareEvent = getEvent(
        section,
        "snare",
        bar,
        s
      );

      if (snareEvent) {
        this._drumNoise(
          t,
          0.12,
          drumVolume(
            snareEvent,
            0.13,
            0.21
          ),
          "highpass",
          1200
        );
      }

      // ----------------------------------------------------------
      // HAT
      // ----------------------------------------------------------

      const hatEvent = getEvent(
        section,
        "hat",
        bar,
        s
      );

      if (hatEvent) {
        this._drumNoise(
          t,
          0.025,
          drumVolume(
            hatEvent,
            0.016,
            0.03
          ),
          "highpass",
          7200
        );
      }

      // ----------------------------------------------------------
      // CRASH
      // ----------------------------------------------------------

      const crashEvent = getEvent(
        section,
        "crash",
        bar,
        s
      );

      if (crashEvent) {
        this._drumNoise(
          t,
          0.35,
          drumVolume(
            crashEvent,
            0.06,
            0.10
          ),
          "highpass",
          3200
        );
      }
    };

    // ============================================================
    // CLOCK
    // ============================================================

    this._playing = {
      step: 0,
      nextTime: this.ctx.currentTime + 0.08,
    };

    const lookahead = 0.12;

    this._timer = setInterval(() => {
      if (!this.ctx || !this._playing) return;

      while (
        this._playing.nextTime <
        this.ctx.currentTime + lookahead
      ) {
        scheduleStep(
          this._playing.step,
          this._playing.nextTime
        );

        this._playing.nextTime += step16;

        this._playing.step =
          (this._playing.step + 1) % TOTAL_STEPS;
      }
    }, 25);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._playing = null;
    if (this._gain) {
      const g = this._gain;
      // fade out so already-scheduled notes don't click, then drop it
      try {
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
        setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 400);
      } catch (e) {}
      this._gain = null;
    }
    // The metal bus was wired into the now-dead gain; drop it so the next
    // start() rebuilds it against the fresh music gain.
    if (this._metalBus) {
      const bus = this._metalBus;
      setTimeout(() => { try { bus.output.disconnect(); } catch (e) {} }, 400);
      this._metalBus = null;
    }
  }

  // --- Voices ----------------------------------------------------------------

  // A music note at an absolute time `t` (constant pitch, percussive envelope).
  // Muting is handled by the master gain, so the loop keeps its timing and
  // unmutes seamlessly.
  _note(type, freq, t, dur, gain, dest) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.destination);
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
    osc.connect(g).connect(this._gain || this.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // A shared 1s white-noise buffer, generated once and reused for every drum hit.
  // Drums fire on almost every 16th note, so allocating + filling a fresh buffer each
  // time (the old behaviour) was steady main-thread garbage — this reuses one buffer.
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

  // Filtered noise burst at absolute time `t` — used for snare/hat/crash.
  _drumNoise(t, dur, gain, filterType, freq) {
    if (!this.ctx) return;
    const buf = this._noiseBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.value = freq;
    const g = this.ctx.createGain();
    // Percussive decay via a gain ramp (was baked per-sample into the buffer).
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this._gain || this.destination);
    // Play a random slice so repeated hits don't sound machine-gun identical.
    src.start(t, Math.random() * Math.max(0.001, buf.duration - dur), dur);
  }
}

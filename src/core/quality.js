// Adaptive quality manager. The neon look leans hard on canvas `shadowBlur` (glow),
// whose cost scales with device pixels — brutal on weak GPUs. This module watches real
// frame timing and steps a global quality tier up/down so the game stays smooth. Every
// expensive knob reads from here:
//   dpr       — device-pixel cap for the canvas backing store (glow/fill cost ~ dpr^2)
//   glow      — multiplier applied to every shadowBlur (see Renderer's intercept)
//   particles — emit-count multiplier for the particle system
//   bgDetail  — how much of the parallax background to draw (firefly/spore counts, vines)
//
// Detection is refresh-rate aware: with vsync a fast machine still reports ~16.7ms
// frames, so wall-clock frame delta alone can't reveal spare headroom. We therefore
// track BOTH the rAF-to-rAF delta (catches real dropped frames -> degrade) and the JS
// work time spent updating+rendering (reveals headroom -> upgrade).

const TIERS = {
  high: { dprCap: 2,   glow: 1.0,  particles: 1.0,  bgDetail: 1.0 },
  med:  { dprCap: 1.5, glow: 0.7,  particles: 0.7,  bgDetail: 0.6 },
  low:  { dprCap: 1.0, glow: 0.4,  particles: 0.45, bgDetail: 0.3 },
};
const ORDER = ["low", "med", "high"];

export const quality = {
  tier: "high",
  dpr: 2,
  glow: 1,
  particles: 1,
  bgDetail: 1,
  auto: true,

  // adaptive state (frame times in ms)
  _deltaEma: 1000 / 60,
  _workEma: 8,
  _hold: 0,     // seconds we must wait before another auto change (hysteresis)
  _warm: 30,    // skip the first N frames (module load / first paint are spikes)

  onChange: null, // (tier) => void — host applies the new dpr/glow
};

function apply(tier) {
  const p = TIERS[tier];
  quality.tier = tier;
  quality.dpr = p.dprCap;
  quality.glow = p.glow;
  quality.particles = p.particles;
  quality.bgDetail = p.bgDetail;
  if (quality.onChange) quality.onChange(tier);
}

// Pick a conservative starting tier from coarse device hints so a weak machine doesn't
// spend its first seconds janking before the adaptive loop reacts. Call before creating
// the renderer (it reads quality.dpr on construction).
export function initQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4; // GiB, coarse; undefined on Firefox/Safari
  let tier = "med";
  if (cores <= 2 || mem <= 2) tier = "low";
  else if (cores >= 8 && mem >= 8) tier = "high";
  apply(tier);
}

// Manual override (disables auto until re-enabled).
export function setTier(tier) {
  if (!TIERS[tier]) return;
  quality.auto = false;
  apply(tier);
}
export function setAuto(on) {
  quality.auto = !!on;
  quality._hold = 1;
}

// Fed once per rendered frame from the loop.
//   delta — rAF-to-rAF wall-clock ms (vsync-capped; detects dropped frames)
//   work  — ms of JS spent in update()+render() this frame (reveals headroom)
export function sampleFrame(delta, work) {
  if (quality._warm > 0) { quality._warm--; return; }
  if (delta > 100) return; // ignore stalls (tab switch, breakpoint, big GC)

  quality._deltaEma += (delta - quality._deltaEma) * 0.08;
  quality._workEma += (work - quality._workEma) * 0.08;

  if (!quality.auto) return;
  if (quality._hold > 0) { quality._hold -= delta / 1000; return; }

  const i = ORDER.indexOf(quality.tier);
  // Degrade fast when frames are actually slow or JS work is heavy.
  if ((quality._deltaEma > 22 || quality._workEma > 14) && i > 0) {
    apply(ORDER[i - 1]);
    quality._hold = 2.5;
    quality._deltaEma = 1000 / 60;
    quality._workEma = 8;
  // Upgrade only with clear headroom: hitting ~60fps AND cheap JS work.
  } else if (quality._deltaEma < 17.5 && quality._workEma < 6 && i < ORDER.length - 1) {
    apply(ORDER[i + 1]);
    quality._hold = 4;
    quality._deltaEma = 1000 / 60;
    quality._workEma = 8;
  }
}

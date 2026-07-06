// Parallax neon JUNGLE backdrop, drawn in screen space (CSS pixels). Layers, back to
// front:
//   1. deep jungle-night sky gradient + low horizon glow
//   2. glowing moon with a halo
//   3. slow drifting mist bands
//   4. distant lumpy canopy silhouette (dim teal rim)
//   5. mid layer of neon palms / ferns (bright green rim)
//   6. twinkling fireflies
//   7. foreground fronds arcing in from the corners + hanging vines (cyan/magenta)
// Everything is procedural and parallax-scrolled by the camera's horizontal position.

import { createRng } from "../core/rng.js";
import { TAU } from "../core/math.js";

// Deterministic hash in [0,1) from an integer — keeps a motif's shape stable while it
// scrolls (so nothing flickers as new instances enter the view).
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class Background {
  constructor() {
    this.rng = createRng(1337);
    this.fireflies = Array.from({ length: 46 }, () => ({
      x: this.rng() * 1600,
      y: 60 + this.rng() * 520,
      r: 0.8 + this.rng() * 1.8,
      ph: this.rng() * TAU,
      spd: 0.3 + this.rng() * 0.7,
      drift: 6 + this.rng() * 14,
    }));

    // Faint spores/pollen drifting up through the air (denser, dimmer than fireflies).
    this.spores = Array.from({ length: 80 }, () => ({
      x: this.rng() * 1800,
      yf: this.rng(),          // vertical position as a fraction of screen height
      r: 0.5 + this.rng() * 1.6,
      ph: this.rng() * TAU,
      spd: 0.2 + this.rng() * 0.5,
      vy: 4 + this.rng() * 12,  // upward drift px/s
      sway: 4 + this.rng() * 12,
    }));
  }

  draw(renderer, camera, time) {
    const { ctx, cssW, cssH } = renderer;
    renderer.beginScreen();

    // 1. Sky
    const sky = ctx.createLinearGradient(0, 0, 0, cssH);
    sky.addColorStop(0, "#03110d");
    sky.addColorStop(0.45, "#07132a");
    sky.addColorStop(1, "#0f0a22");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssW, cssH);

    // teal ground-glow near the horizon
    const hg = ctx.createRadialGradient(cssW * 0.5, cssH * 1.05, 0, cssW * 0.5, cssH * 1.05, cssH * 0.9);
    hg.addColorStop(0, "rgba(47,211,154,0.20)");
    hg.addColorStop(1, "rgba(47,211,154,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, cssW, cssH);

    // 2. Moon (parallax 0.05)
    this._moon(ctx, cssW * 0.74 - camera.left * 0.05, cssH * 0.24, cssH * 0.075, time);

    // 3. Mist bands
    this._mist(ctx, cssW, cssH, camera.left, time);

    // 4. Distant canopy silhouette
    this._canopy(ctx, cssW, cssH, camera.left * 0.12, cssH * 0.66, "#071c19", "rgba(31,107,90,0.9)");

    // 5. Mid ferns / palms
    this._plants(ctx, cssW, cssH, camera.left * 0.3, cssH * 0.88, 150, 1.0, "#08221e", "#2fd39a", time, 0);

    // 5b. Drifting spores in the air (parallax 0.35, behind the fireflies)
    this._spores(ctx, cssW, cssH, camera.left * 0.35, time);

    // 6. Fireflies (parallax 0.5)
    this._fireflies(ctx, cssW, cssH, camera.left * 0.5, time);

    // 7. Foreground plants (big, blurred, semi-transparent for depth)
    this._foreground(ctx, cssW, cssH, camera.left * 0.55, time);
  }

  _moon(ctx, x, y, r, time) {
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    glow.addColorStop(0, "rgba(160,255,224,0.35)");
    glow.addColorStop(0.3, "rgba(120,220,255,0.12)");
    glow.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    // disc
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "#a0ffe0";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#daffee";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // faint craters (subtractive dimples)
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(90,180,150,0.25)";
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.22, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.1, r * 0.16, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _mist(ctx, w, h, camLeft, time) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const y = h * (0.5 + i * 0.16);
      const off = (camLeft * 0.2 + time * (8 + i * 6)) % (w + 400);
      const grad = ctx.createLinearGradient(0, y - 30, 0, y + 30);
      const a = 0.05 + i * 0.02;
      grad.addColorStop(0, "rgba(47,211,154,0)");
      grad.addColorStop(0.5, `rgba(80,220,200,${a})`);
      grad.addColorStop(1, "rgba(47,211,154,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(-off, y - 30, w + 800, 60);
    }
    ctx.restore();
  }

  // Lumpy distant foliage: overlapping arcs forming a soft canopy line.
  _canopy(ctx, w, h, off, baseY, fill, edge) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-40, h);
    const step = 46;
    const start = -((off % step) + step);
    for (let x = start; x <= w + step; x += step) {
      const k = Math.round((x + off) / step);
      const r = 30 + hash(k) * 46;
      const cy = baseY - hash(k * 3 + 1) * 40;
      ctx.lineTo(x, cy);
      ctx.arc(x + step / 2, cy, r, Math.PI, 0, false);
    }
    ctx.lineTo(w + 40, h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.shadowColor = edge;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }

  // A row of palms / ferns rising from baseY.
  _plants(ctx, w, h, off, baseY, spacing, scale, fill, edge, time, seed) {
    ctx.save();
    const start = -((off % spacing) + spacing);
    for (let x = start; x <= w + spacing; x += spacing) {
      const k = Math.round((x + off) / spacing) + seed;
      const size = (48 + hash(k) * 46) * scale;
      const sway = Math.sin(time * 0.6 + k) * 0.08;
      if (hash(k * 7) > 0.5) this._palm(ctx, x, baseY, size, sway, fill, edge);
      else this._fern(ctx, x, baseY, size * 1.1, sway, fill, edge);
    }
    ctx.restore();
  }

  // Palm: several tapered blades fanning up from a slim trunk.
  _palm(ctx, bx, by, size, sway, fill, edge) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(sway);
    // trunk
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = edge;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * 0.06, -size * 0.5, size * 0.02, -size);
    ctx.stroke();
    const top = { x: size * 0.02, y: -size };
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1);
      const ang = -Math.PI * 0.5 + (t - 0.5) * Math.PI * 1.15;
      const len = size * (0.62 + 0.25 * Math.sin(t * Math.PI));
      this._blade(ctx, top.x, top.y, ang, len, len * 0.16, fill, edge);
    }
    ctx.restore();
  }

  // Fern: blades radiating from the base in a bushy clump.
  _fern(ctx, bx, by, size, sway, fill, edge) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(sway * 0.5);
    const blades = 9;
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1);
      const ang = -Math.PI * 0.5 + (t - 0.5) * Math.PI * 1.3;
      const len = size * (0.55 + 0.4 * Math.sin(t * Math.PI));
      this._blade(ctx, 0, 0, ang, len, len * 0.13, fill, edge);
    }
    ctx.restore();
  }

  // One leaf blade: a pointed lens shape from (x,y) along `ang` for `len`, half-width `hw`.
  _blade(ctx, x, y, ang, len, hw, fill, edge) {
    const tx = x + Math.cos(ang) * len;
    const ty = y + Math.sin(ang) * len;
    const px = Math.cos(ang + Math.PI / 2) * hw;
    const py = Math.sin(ang + Math.PI / 2) * hw;
    const mx = (x + tx) / 2, my = (y + ty) / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx + px, my + py, tx, ty);
    ctx.quadraticCurveTo(mx - px, my - py, x, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = edge;
    ctx.shadowBlur = 8;
    ctx.stroke();
  }

  _spores(ctx, w, h, off, time) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const span = w + 80;
    for (const s of this.spores) {
      // Continuous wrap on x (parallax + gentle sway) so nothing snaps while scrolling.
      let x = ((s.x - off + Math.sin(time * s.spd + s.ph) * s.sway) % span + span) % span - 40;
      let y = (s.yf * h - time * s.vy) % h; // slow upward drift, wraps
      if (y < 0) y += h;
      const a = 0.10 + 0.14 * (0.5 + 0.5 * Math.sin(time * 1.5 * s.spd + s.ph));
      ctx.globalAlpha = a;
      ctx.shadowColor = "#bfeaff";
      ctx.shadowBlur = 5;
      ctx.fillStyle = "#e6f6ff";
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _fireflies(ctx, w, h, off, time) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.fireflies) {
      let x = ((f.x - off + Math.sin(time * f.spd + f.ph) * f.drift) % (w + 80) + (w + 80)) % (w + 80) - 40;
      const y = f.y + Math.cos(time * f.spd * 0.8 + f.ph) * f.drift;
      const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3 * f.spd + f.ph));
      ctx.globalAlpha = a;
      ctx.shadowColor = "#c9ff6a";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#eaffb0";
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Big, soft, semi-transparent plants + hanging vines framing the view.
  _foreground(ctx, w, h, off, time) {
    ctx.save();

    // Nearest layer: a repeating band of big fronds. This is a proper parallax band —
    // motifs scroll continuously and wrap in/out at the screen edges, so it moves with
    // the camera (the parallax the eye likes) but never snaps.
    const spacing = 220;
    const start = -((off % spacing) + spacing);
    for (let x = start; x <= w + spacing; x += spacing) {
      const k = Math.round((x + off) / spacing);
      const size = h * (0.4 + hash(k) * 0.18);
      const magenta = hash(k * 3) > 0.5;
      const fill = magenta ? "rgba(20,6,26,0.82)" : "rgba(6,20,30,0.82)";
      const edge = magenta ? "#ff3df0" : "#37f2ff";
      const lean = (hash(k * 7) - 0.5) * 0.9; // gentle left/right lean per frond
      this._bottomFrond(ctx, x + hash(k * 5) * 50, h + 14, size, lean, fill, edge, time, k);
    }

    // hanging vines from the top (same continuous-wrap parallax)
    const vSpacing = 190;
    const vStart = -((off % vSpacing) + vSpacing);
    for (let x = vStart; x <= w + vSpacing; x += vSpacing) {
      const k = Math.round((x + off) / vSpacing);
      this._vine(ctx, x + hash(k) * 60, -6, h * (0.28 + hash(k * 5) * 0.22), hash(k * 9) > 0.5 ? "#2fd39a" : "#37f2ff", time, k);
    }
    ctx.restore();
  }

  // A big frond fanning up from the bottom edge, with a per-frond lean and gentle sway.
  _bottomFrond(ctx, x, y, size, lean, fill, edge, time, seed) {
    ctx.save();
    ctx.translate(x, y);
    const sway = Math.sin(time * 0.5 + seed) * 0.06;
    ctx.rotate(lean + sway);
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1);
      const ang = -Math.PI / 2 + (t - 0.5) * Math.PI * 0.85; // fan around straight up
      const len = size * (0.55 + 0.45 * Math.sin(t * Math.PI));
      ctx.globalAlpha = 0.82;
      this._blade(ctx, 0, 0, ang, len, len * 0.15, fill, edge);
    }
    ctx.restore();
  }

  _vine(ctx, x, topY, len, edge, time, seed) {
    ctx.save();
    const segs = 8;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push({ x: x + Math.sin(t * 3 + time * 0.6 + seed) * 10 * t, y: topY + len * t });
    }
    // vine line first
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.shadowColor = edge;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    // then leaves along it
    for (let i = 3; i < segs; i += 3) {
      const p = pts[i];
      const ang = (i % 2 ? 1 : -1) * 0.7;
      this._blade(ctx, p.x, p.y, ang, 14, 4, "rgba(10,24,20,0.7)", edge);
    }
    ctx.restore();
  }
}

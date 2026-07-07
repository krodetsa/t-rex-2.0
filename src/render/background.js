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

  // Sky + horizon-glow gradients depend only on the canvas size, so build them once and
  // reuse until the viewport changes (creating gradients every frame is wasteful).
  _staticGradients(ctx, cssW, cssH) {
    if (this._grad && this._grad.w === cssW && this._grad.h === cssH) return this._grad;
    const sky = ctx.createLinearGradient(0, 0, 0, cssH);
    sky.addColorStop(0, "#03110d");
    sky.addColorStop(0.45, "#07132a");
    sky.addColorStop(1, "#0f0a22");
    const hg = ctx.createRadialGradient(cssW * 0.5, cssH * 1.05, 0, cssW * 0.5, cssH * 1.05, cssH * 0.9);
    hg.addColorStop(0, "rgba(47,211,154,0.20)");
    hg.addColorStop(1, "rgba(47,211,154,0)");
    const mist = [];
    for (let i = 0; i < 3; i++) {
      const y = cssH * (0.5 + i * 0.16);
      const g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
      const a = 0.05 + i * 0.02;
      g.addColorStop(0, "rgba(47,211,154,0)");
      g.addColorStop(0.5, `rgba(80,220,200,${a})`);
      g.addColorStop(1, "rgba(47,211,154,0)");
      mist.push({ y, g });
    }
    this._grad = { w: cssW, h: cssH, sky, hg, mist };
    return this._grad;
  }

  draw(renderer, camera, time) {
    const { ctx, cssW, cssH } = renderer;
    renderer.beginScreen();
    const g = this._staticGradients(ctx, cssW, cssH);

    // 1. Sky
    ctx.fillStyle = g.sky;
    ctx.fillRect(0, 0, cssW, cssH);

    // teal ground-glow near the horizon
    ctx.fillStyle = g.hg;
    ctx.fillRect(0, 0, cssW, cssH);

    // 2. Moon (parallax 0.05)
    this._moon(ctx, cssW * 0.74 - camera.left * 0.05, cssH * 0.24, cssH * 0.075, time);

    // 3. Mist bands
    this._mist(ctx, cssW, cssH, camera.left, time, g.mist);

    // 4. Distant canopy silhouette
    this._canopy(ctx, cssW, cssH, camera.left * 0.12, cssH * 0.66, "#071c19", "rgba(31,107,90,0.9)");

    // 5. Mid ferns / palms
    this._plants(ctx, cssW, cssH, camera.left * 0.3, cssH * 0.88, 150, 1.0, "#08221e", "#2fd39a", time, 0);

    // 5b. Drifting spores in the air (parallax 0.35, behind the fireflies)
    this._spores(renderer, cssW, cssH, camera.left * 0.35, time);

    // 6. Fireflies (parallax 0.5)
    this._fireflies(renderer, cssW, cssH, camera.left * 0.5, time);

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

  _mist(ctx, w, h, camLeft, time, mist) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const { y, g } = mist[i];
      const off = (camLeft * 0.2 + time * (8 + i * 6)) % (w + 400);
      ctx.fillStyle = g;
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

  // A row of palms / ferns rising from baseY. Every blade in the layer is accumulated
  // into shared Path2D batches (in absolute screen coords) and drawn with a single
  // shadowed fill + stroke pass, so the whole layer costs ~3 glow ops instead of one
  // per blade (the glow — shadowBlur — is the expensive part).
  _plants(ctx, w, h, off, baseY, spacing, scale, fill, edge, time, seed) {
    const fillP = new Path2D();
    const bladeStroke = new Path2D();
    const trunkStroke = new Path2D();
    const start = -((off % spacing) + spacing);
    for (let x = start; x <= w + spacing; x += spacing) {
      const k = Math.round((x + off) / spacing) + seed;
      const size = (48 + hash(k) * 46) * scale;
      const sway = Math.sin(time * 0.6 + k) * 0.08;
      if (hash(k * 7) > 0.5) this._palm(fillP, bladeStroke, trunkStroke, x, baseY, size, sway);
      else this._fern(fillP, bladeStroke, x, baseY, size * 1.1, sway);
    }
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = edge;
    ctx.shadowBlur = 8;
    ctx.fillStyle = fill;
    ctx.fill(fillP);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.4;
    ctx.stroke(bladeStroke);
    ctx.lineWidth = 2.4;
    ctx.stroke(trunkStroke);
    ctx.restore();
  }

  // Palm: several tapered blades fanning up from a slim trunk. Geometry is written into
  // the layer's shared paths in absolute coords (rotation baked in) so it can be batched.
  _palm(fillP, bladeStroke, trunkStroke, bx, by, size, sway) {
    const c = Math.cos(sway), s = Math.sin(sway);
    const TX = (lx, ly) => bx + lx * c - ly * s;
    const TY = (lx, ly) => by + lx * s + ly * c;
    trunkStroke.moveTo(TX(0, 0), TY(0, 0));
    trunkStroke.quadraticCurveTo(
      TX(size * 0.06, -size * 0.5), TY(size * 0.06, -size * 0.5),
      TX(size * 0.02, -size), TY(size * 0.02, -size));
    const topX = TX(size * 0.02, -size), topY = TY(size * 0.02, -size);
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1);
      const ang = -Math.PI * 0.5 + (t - 0.5) * Math.PI * 1.15 + sway;
      const len = size * (0.62 + 0.25 * Math.sin(t * Math.PI));
      this._blade(fillP, bladeStroke, topX, topY, ang, len, len * 0.16);
    }
  }

  // Fern: blades radiating from the base in a bushy clump (base sits at (bx,by), so the
  // sway rotation only tilts the blade angles).
  _fern(fillP, bladeStroke, bx, by, size, sway) {
    const rot = sway * 0.5;
    const blades = 9;
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1);
      const ang = -Math.PI * 0.5 + (t - 0.5) * Math.PI * 1.3 + rot;
      const len = size * (0.55 + 0.4 * Math.sin(t * Math.PI));
      this._blade(fillP, bladeStroke, bx, by, ang, len, len * 0.13);
    }
  }

  // Append one leaf-blade lens (from (x,y) along `ang` for `len`, half-width `hw`) to
  // both the fill and stroke batch paths.
  _blade(fillP, strokeP, x, y, ang, len, hw) {
    const tx = x + Math.cos(ang) * len;
    const ty = y + Math.sin(ang) * len;
    const px = Math.cos(ang + Math.PI / 2) * hw;
    const py = Math.sin(ang + Math.PI / 2) * hw;
    const mx = (x + tx) / 2, my = (y + ty) / 2;
    const bp = new Path2D();
    bp.moveTo(x, y);
    bp.quadraticCurveTo(mx + px, my + py, tx, ty);
    bp.quadraticCurveTo(mx - px, my - py, x, y);
    bp.closePath();
    fillP.addPath(bp);
    strokeP.addPath(bp);
  }

  _spores(r, w, h, off, time) {
    const ctx = r.ctx;
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
      r.glowDot(x, y, s.r, "#e6f6ff");
    }
    ctx.restore();
  }

  _fireflies(r, w, h, off, time) {
    const ctx = r.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.fireflies) {
      let x = ((f.x - off + Math.sin(time * f.spd + f.ph) * f.drift) % (w + 80) + (w + 80)) % (w + 80) - 40;
      const y = f.y + Math.cos(time * f.spd * 0.8 + f.ph) * f.drift;
      const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3 * f.spd + f.ph));
      ctx.globalAlpha = a;
      r.glowDot(x, y, f.r * 1.4, "#eaffb0");
    }
    ctx.restore();
  }

  // Big, soft, semi-transparent plants + hanging vines framing the view. Batched by
  // color into a handful of shadowed passes.
  _foreground(ctx, w, h, off, time) {
    // Nearest layer: a repeating band of big fronds, in two color variants.
    const fr = {
      mag: { fill: "rgba(20,6,26,0.82)", edge: "#ff3df0", fillP: new Path2D(), strokeP: new Path2D() },
      cyan: { fill: "rgba(6,20,30,0.82)", edge: "#37f2ff", fillP: new Path2D(), strokeP: new Path2D() },
    };
    const spacing = 220;
    const start = -((off % spacing) + spacing);
    for (let x = start; x <= w + spacing; x += spacing) {
      const k = Math.round((x + off) / spacing);
      const size = h * (0.4 + hash(k) * 0.18);
      const b = hash(k * 3) > 0.5 ? fr.mag : fr.cyan;
      const lean = (hash(k * 7) - 0.5) * 0.9; // gentle left/right lean per frond
      this._bottomFrond(b.fillP, b.strokeP, x + hash(k * 5) * 50, h + 14, size, lean, time, k);
    }
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = 1.4;
    for (const key in fr) {
      const b = fr[key];
      ctx.shadowColor = b.edge;
      ctx.shadowBlur = 8;
      ctx.fillStyle = b.fill;
      ctx.fill(b.fillP);
      ctx.strokeStyle = b.edge;
      ctx.stroke(b.strokeP);
    }
    ctx.restore();

    // Hanging vines from the top (same continuous-wrap parallax), batched by color.
    const vb = {
      a: { edge: "#2fd39a", lineP: new Path2D(), leafFill: new Path2D(), leafStroke: new Path2D() },
      b: { edge: "#37f2ff", lineP: new Path2D(), leafFill: new Path2D(), leafStroke: new Path2D() },
    };
    const vSpacing = 190;
    const vStart = -((off % vSpacing) + vSpacing);
    for (let x = vStart; x <= w + vSpacing; x += vSpacing) {
      const k = Math.round((x + off) / vSpacing);
      const bucket = hash(k * 9) > 0.5 ? vb.a : vb.b;
      this._vine(bucket, x + hash(k) * 60, -6, h * (0.28 + hash(k * 5) * 0.22), time, k);
    }
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const key in vb) {
      const b = vb[key];
      ctx.shadowColor = b.edge;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = b.edge;
      ctx.lineWidth = 2;
      ctx.stroke(b.lineP);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(10,24,20,0.7)";
      ctx.fill(b.leafFill);
      ctx.lineWidth = 1.4;
      ctx.stroke(b.leafStroke);
    }
    ctx.restore();
  }

  // A big frond fanning up from the bottom edge (origin at (x,y), so lean+sway only tilt
  // the blade angles). Accumulates into the caller's fill/stroke batch paths.
  _bottomFrond(fillP, strokeP, x, y, size, lean, time, seed) {
    const rot = lean + Math.sin(time * 0.5 + seed) * 0.06;
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1);
      const ang = -Math.PI / 2 + (t - 0.5) * Math.PI * 0.85 + rot; // fan around straight up
      const len = size * (0.55 + 0.45 * Math.sin(t * Math.PI));
      this._blade(fillP, strokeP, x, y, ang, len, len * 0.15);
    }
  }

  _vine(bucket, x, topY, len, time, seed) {
    const segs = 8;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push({ x: x + Math.sin(t * 3 + time * 0.6 + seed) * 10 * t, y: topY + len * t });
    }
    // vine line
    pts.forEach((p, i) => (i === 0 ? bucket.lineP.moveTo(p.x, p.y) : bucket.lineP.lineTo(p.x, p.y)));
    // leaves along it
    for (let i = 3; i < segs; i += 3) {
      const p = pts[i];
      const ang = (i % 2 ? 1 : -1) * 0.7;
      this._blade(bucket.leafFill, bucket.leafStroke, p.x, p.y, ang, 14, 4);
    }
  }
}

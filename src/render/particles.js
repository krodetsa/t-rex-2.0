// Pooled particle system. One flat array of particles, drawn additively as glowing
// dots for that neon-spark look. Emitters cover dust, jump/land puffs, footsteps,
// bone-collect bursts, and the death shatter.

import { rand, TAU } from "../core/math.js";

export class Particles {
  constructor(max = 400) {
    this.max = max;
    this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push(newParticle());
    this.count = 0; // active particles live at the front of the pool
  }

  _spawn() {
    if (this.count >= this.max) return null;
    return this.pool[this.count++];
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove with the last active particle
        const last = this.pool[--this.count];
        this.pool[this.count] = p;
        this.pool[i] = last;
        i--;
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(r) {
    const ctx = r.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, t)) * p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.blur;
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * (0.4 + 0.6 * t);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + 0.7 * t), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // --- Emitters --------------------------------------------------------------

  jump(x, y) {
    for (let i = 0; i < 8; i++) {
      const p = this._spawn(); if (!p) break;
      const a = rand(Math.PI * 0.15, Math.PI * 0.85);
      const sp = rand(40, 120);
      init(p, x, y, -Math.cos(a) * sp * (i % 2 ? 1 : -1), -Math.sin(a) * sp,
        { color: "#8fe9ff", size: rand(2, 4), life: rand(0.25, 0.5), gravity: 120, drag: 0.9, blur: 8 });
    }
  }

  land(x, y, power) {
    const n = 6 + Math.floor(power * 12);
    for (let i = 0; i < n; i++) {
      const p = this._spawn(); if (!p) break;
      const dir = i % 2 ? 1 : -1;
      init(p, x + rand(-4, 4), y, dir * rand(40, 180) * (0.5 + power), rand(-30, -80),
        { color: "#bfe9ff", size: rand(2, 4.5), life: rand(0.25, 0.55), gravity: 260, drag: 0.86, blur: 8 });
    }
  }

  footstep(x, y, dir) {
    const p = this._spawn(); if (!p) return;
    init(p, x, y, -dir * rand(20, 60), rand(-10, -40),
      { color: "#7fd3ff", size: rand(1.5, 3), life: rand(0.2, 0.4), gravity: 200, drag: 0.9, blur: 6, alpha: 0.7 });
  }

  boneBurst(x, y) {
    for (let i = 0; i < 16; i++) {
      const p = this._spawn(); if (!p) break;
      const a = rand(0, TAU);
      const sp = rand(60, 200);
      init(p, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        { color: i % 3 ? "#37f2ff" : "#eafcff", size: rand(2, 4), life: rand(0.35, 0.7), gravity: 120, drag: 0.9, blur: 10 });
    }
  }

  death(x, y) {
    for (let i = 0; i < 26; i++) {
      const p = this._spawn(); if (!p) break;
      const a = rand(0, TAU);
      const sp = rand(60, 300);
      init(p, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60,
        { color: i % 4 ? "#ff3df0" : "#37f2ff", size: rand(2.5, 5), life: rand(0.5, 1.0), gravity: 420, drag: 0.92, blur: 10, shape: "rect", vr: rand(-8, 8) });
    }
  }

  ember(x, y) {
    const p = this._spawn(); if (!p) return;
    init(p, x, y, rand(-10, 10), rand(-20, -60),
      { color: "#ff7a3d", size: rand(1.5, 3), life: rand(0.6, 1.4), gravity: -20, drag: 0.98, blur: 8, alpha: 0.8 });
  }
}

function newParticle() {
  return {
    x: 0, y: 0, vx: 0, vy: 0, gravity: 0, drag: 1,
    life: 0, maxLife: 1, size: 3, color: "#fff", blur: 8,
    alpha: 1, shape: "circle", rot: 0, vr: 0,
  };
}

function init(p, x, y, vx, vy, opts) {
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.gravity = opts.gravity ?? 0;
  p.drag = opts.drag ?? 1;
  p.life = p.maxLife = opts.life ?? 0.5;
  p.size = opts.size ?? 3;
  p.color = opts.color ?? "#fff";
  p.blur = opts.blur ?? 8;
  p.alpha = opts.alpha ?? 1;
  p.shape = opts.shape ?? "circle";
  p.rot = 0;
  p.vr = opts.vr ?? 0;
}

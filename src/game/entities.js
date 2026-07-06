// Level entities: collectible Bones, patrolling Fireballs, and the Goal portal.
// Each keeps a previous-position snapshot so the renderer can interpolate.

import { TILE } from "./level.js";
import { moveAndCollide } from "./physics.js";
import { TAU } from "../core/math.js";

const CYAN = "#37f2ff";
const BONE_COL = "#eafcff";
const FIRE_A = "#ff9a3d";
const FIRE_B = "#ff3d5a";
const GOAL_ON = "#4dffa3";
const GOAL_OFF = "#2a6b57";

export class Bone {
  constructor(spec) {
    this.w = 18; this.h = 18;
    this.x = spec.x + (TILE - this.w) / 2;
    this.y = spec.y + (TILE - this.h) / 2;
    this.baseY = this.y;
    this.phase = Math.random() * TAU;
    this.collected = false;
    this.type = "bone";
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt, level, time) {
    this.phase += dt * 3;
    this.y = this.baseY + Math.sin(this.phase) * 3;
  }

  draw(r, alpha, time) {
    const ctx = r.ctx;
    const x = this.cx;
    const y = this.cy;
    const rot = Math.sin(this.phase * 0.6) * 0.35;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = BONE_COL;
    ctx.fillStyle = BONE_COL;
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    // shaft
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    // four knobs
    for (const [kx, ky] of [[-6, -3], [-6, 3], [6, -3], [6, 3]]) {
      ctx.beginPath();
      ctx.arc(kx, ky, 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class Fireball {
  constructor(spec, axis) {
    this.w = 16; this.h = 16;
    this.axis = axis; // 'h' or 'v'
    this.speed = axis === "h" ? 90 : 80;
    this.body = {
      x: spec.x + (TILE - this.w) / 2,
      y: spec.y + (TILE - this.h) / 2,
      w: this.w, h: this.h,
      vx: axis === "h" ? this.speed : 0,
      vy: axis === "v" ? this.speed : 0,
    };
    this.px = this.body.x; this.py = this.body.y;
    this.time = Math.random() * 10;
    this.type = "fireball";
  }
  get cx() { return this.body.x + this.w / 2; }
  get cy() { return this.body.y + this.h / 2; }

  update(dt, level) {
    this.px = this.body.x; this.py = this.body.y;
    this.time += dt;
    const f = moveAndCollide(this.body, level, dt);
    if (this.axis === "h") {
      if (f.hitLeft) this.body.vx = this.speed;
      else if (f.hitRight) this.body.vx = -this.speed;
    } else {
      if (f.hitCeiling) this.body.vy = this.speed;
      else if (f.grounded) this.body.vy = -this.speed;
    }
  }

  renderPos(alpha) {
    return {
      x: this.px + (this.body.x - this.px) * alpha,
      y: this.py + (this.body.y - this.py) * alpha,
    };
  }

  draw(r, alpha, time) {
    const ctx = r.ctx;
    const p = this.renderPos(alpha);
    const cx = p.x + this.w / 2;
    const cy = p.y + this.h / 2;
    const flick = 1 + Math.sin(this.time * 20) * 0.12;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // outer glow
    ctx.shadowColor = FIRE_B;
    ctx.shadowBlur = 22;
    ctx.fillStyle = FIRE_B;
    ctx.beginPath();
    ctx.arc(cx, cy, 9 * flick, 0, TAU);
    ctx.fill();
    // hot core
    ctx.shadowColor = FIRE_A;
    ctx.shadowBlur = 14;
    ctx.fillStyle = FIRE_A;
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * flick, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffe8b0";
    ctx.beginPath();
    ctx.arc(cx, cy, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

export class Goal {
  constructor(spec) {
    this.w = 30; this.h = 44;
    this.x = spec.x + (TILE - this.w) / 2;
    this.y = spec.y + TILE - this.h;
    this.active = false; // opens once all bones are collected
    this.time = 0;
    this.type = "goal";
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt) { this.time += dt; }

  draw(r, alpha, time) {
    const ctx = r.ctx;
    const cx = this.cx, cy = this.cy;
    const col = this.active ? GOAL_ON : GOAL_OFF;
    const rings = 3;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < rings; i++) {
      const t = this.time * (this.active ? 2.4 : 0.8) + (i * TAU) / rings;
      const rw = this.w / 2 - i * 3;
      const rh = this.h / 2 - i * 3;
      ctx.shadowColor = col;
      ctx.shadowBlur = this.active ? 18 : 8;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let a = 0; a <= TAU + 0.1; a += 0.3) {
        const wob = 1 + Math.sin(a * 3 + t) * (this.active ? 0.12 : 0.05);
        const px = cx + Math.cos(a) * rw * wob;
        const py = cy + Math.sin(a) * rh * wob;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    if (this.active) {
      ctx.shadowColor = GOAL_ON;
      ctx.shadowBlur = 26;
      ctx.fillStyle = "rgba(77,255,163,0.14)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, this.w / 2, this.h / 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

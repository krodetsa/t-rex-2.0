// Level entities: collectible Bones, patrolling Fireballs, and the Goal portal.
// Each keeps a previous-position snapshot so the renderer can interpolate.

import { TILE, T } from "./level.js";
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

// --- Enemy dinosaurs ---------------------------------------------------------
// Smaller neon dinos that patrol left/right on solid ground, reversing at walls
// and at ledges (so they never wander into lava or off a platform). The "shooter"
// kind periodically spits a fireball toward the T-Rex; the shot cadence/range are
// driven by the Game. A single hit from the player's fireball kills them.
const ENEMY_SPEED = 58;
const ENEMY_GRAVITY = 2000;
const ENEMY_TERMINAL = 820;
const ENEMY_A = "#ff466e";        // body outline (hot pink-red)
const ENEMY_FILL = "rgba(40,8,24,0.72)";
const ENEMY_ACCENT = "#ffd23d";   // shooter eye/mouth accent (amber)
export const SHOOT_INTERVAL = 2.2; // s between a shooter's shots
export const SHOOT_RANGE = 340;    // only fire when the T-Rex is within this horizontal range

export class Enemy {
  constructor(spec, kind) {
    this.w = 20; this.h = 24;
    this.kind = kind; // 'walker' | 'shooter'
    this.body = {
      x: spec.x + (TILE - this.w) / 2,
      y: spec.y + TILE - this.h,
      w: this.w, h: this.h,
      vx: -ENEMY_SPEED, vy: 0,
    };
    this.dir = -1;
    this.grounded = false;
    this.px = this.body.x; this.py = this.body.y;
    this.walkPhase = Math.random() * TAU;
    this.time = Math.random() * 10;
    // Stagger the first shot so a group of shooters doesn't fire in unison.
    this.shootTimer = SHOOT_INTERVAL * (0.4 + Math.random() * 0.6);
    this.alive = true;
    this.type = "enemy";
  }
  get cx() { return this.body.x + this.w / 2; }
  get cy() { return this.body.y + this.h / 2; }

  update(dt, level) {
    this.px = this.body.x; this.py = this.body.y;
    this.time += dt;
    const b = this.body;

    b.vy = Math.min(b.vy + ENEMY_GRAVITY * dt, ENEMY_TERMINAL);
    b.vx = this.dir * ENEMY_SPEED;
    const f = moveAndCollide(b, level, dt);
    this.grounded = f.grounded;

    // Reverse at walls.
    if (f.hitLeft) this.dir = 1;
    else if (f.hitRight) this.dir = -1;

    // Reverse at ledges: if the tile just past the leading foot has no floor, turn back.
    if (this.grounded) {
      const aheadX = this.dir > 0 ? b.x + b.w + 1 : b.x - 1;
      const col = Math.floor(aheadX / TILE);
      const row = Math.floor((b.y + b.h + 1) / TILE);
      const under = level.tileAt(col, row);
      if (under !== T.SOLID && under !== T.ONEWAY) this.dir = -this.dir;
    }

    this.walkPhase += Math.abs(b.vx) * dt * 0.05;
  }

  renderPos(alpha) {
    return {
      x: this.px + (this.body.x - this.px) * alpha,
      y: this.py + (this.body.y - this.py) * alpha,
    };
  }

  draw(r, alpha, time) { drawEnemy(r, this, alpha, time); }
}

// --- Projectiles: fired fireballs (the T-Rex's and the enemies') -------------
// A straight-flying fireball. `owner` decides who it hurts, its colour and speed.
// It dies on lifetime, leaving the map, or striking a solid tile.
export class Projectile {
  constructor(x, y, dir, owner) {
    this.w = 12; this.h = 12;
    this.owner = owner; // 'player' | 'enemy'
    this.dir = dir;
    this.vx = dir * (owner === "player" ? 480 : 300);
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.px = this.x; this.py = this.y;
    this.time = Math.random() * 5;
    this.life = 3;
    this.dead = false;
    this.type = "projectile";
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt, level) {
    this.px = this.x; this.py = this.y;
    this.time += dt;
    this.life -= dt;
    this.x += this.vx * dt;
    if (this.life <= 0 || this.x < -40 || this.x > level.width + 40) { this.dead = true; return; }
    if (level.tileAt(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE)) === T.SOLID) this.dead = true;
  }

  renderPos(alpha) {
    return {
      x: this.px + (this.x - this.px) * alpha,
      y: this.py + (this.y - this.py) * alpha,
    };
  }

  draw(r, alpha, time) {
    const ctx = r.ctx;
    const p = this.renderPos(alpha);
    const cx = p.x + this.w / 2;
    const cy = p.y + this.h / 2;
    const flick = 1 + Math.sin(this.time * 24) * 0.15;
    const outer = this.owner === "player" ? "#37f2ff" : FIRE_B;
    const core = this.owner === "player" ? "#bff6ff" : FIRE_A;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // trailing streak behind the direction of travel
    ctx.globalAlpha = 0.45;
    ctx.shadowColor = outer; ctx.shadowBlur = 12;
    ctx.fillStyle = outer;
    ctx.beginPath(); ctx.arc(cx - this.dir * 7, cy, 3 * flick, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // outer glow
    ctx.shadowColor = outer; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(cx, cy, 7 * flick, 0, TAU); ctx.fill();
    // hot core
    ctx.shadowColor = core; ctx.shadowBlur = 10;
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, 3.4 * flick, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// Procedural neon enemy dino, mirrored to face its travel direction.
function drawEnemy(r, e, alpha, time) {
  const ctx = r.ctx;
  const pos = e.renderPos(alpha);
  const feetX = pos.x + e.w / 2;
  const feetY = pos.y + e.h;
  const moving = Math.abs(e.body.vx) > 4;
  const phase = e.walkPhase;
  const bob = moving ? Math.abs(Math.sin(phase)) * 1.2 : Math.sin(time * 2) * 0.5;

  ctx.save();
  ctx.translate(feetX, feetY);
  ctx.scale(e.dir, 1);
  ctx.translate(0, bob);

  // legs (two, out of phase)
  drawEnemyLeg(ctx, -3, moving, phase);
  drawEnemyLeg(ctx, 4, moving, phase + Math.PI);

  // tail
  ctx.save();
  ctx.shadowColor = ENEMY_A; ctx.shadowBlur = 10;
  ctx.strokeStyle = ENEMY_A; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.quadraticCurveTo(-16, -12 + Math.sin(time * 4) * 2, -20, -4);
  ctx.stroke();
  ctx.restore();

  // body
  ctx.save();
  ctx.shadowColor = ENEMY_A; ctx.shadowBlur = 12;
  ctx.fillStyle = ENEMY_FILL; ctx.strokeStyle = ENEMY_A; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -13, 8, 9, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // head + snout (faces forward, +x)
  ctx.save();
  ctx.shadowColor = ENEMY_A; ctx.shadowBlur = 10;
  ctx.fillStyle = ENEMY_FILL; ctx.strokeStyle = ENEMY_A; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(3, -21);
  ctx.quadraticCurveTo(12, -23, 15, -18);
  ctx.lineTo(15, -15);
  ctx.quadraticCurveTo(9, -14, 4, -16);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // shooters have a glowing amber maw so the player can tell them apart
  if (e.kind === "shooter") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = ENEMY_ACCENT; ctx.shadowBlur = 12;
    ctx.fillStyle = ENEMY_ACCENT;
    const g = 1 + Math.sin(time * 8) * 0.3;
    ctx.beginPath(); ctx.arc(15, -16.5, 2.2 * g, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // eye
  const eyeCol = e.kind === "shooter" ? ENEMY_ACCENT : "#ffd0dc";
  ctx.save();
  ctx.shadowColor = eyeCol; ctx.shadowBlur = 8;
  ctx.fillStyle = eyeCol;
  ctx.beginPath(); ctx.arc(9, -19, 1.6, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawEnemyLeg(ctx, hipX, moving, phase) {
  const hipY = -9;
  const s = moving ? Math.sin(phase) * 5 : 0;
  const lift = moving ? Math.max(0, Math.cos(phase)) * 3 : 0;
  const footX = hipX + s;
  const footY = -lift;
  ctx.save();
  ctx.shadowColor = ENEMY_A; ctx.shadowBlur = 6;
  ctx.strokeStyle = ENEMY_A; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo((hipX + footX) / 2 + 2, (hipY + footY) / 2);
  ctx.lineTo(footX, footY);
  ctx.lineTo(footX + 2, footY);
  ctx.stroke();
  ctx.restore();
}

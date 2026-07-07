// The final-level boss: a hulking neon dinosaur, roughly twice the T-Rex's size, that
// flies freely around the arena, occasionally jumps/slams to the floor, and spits aimed
// fireballs at the player. Unlike the small patrolling Enemy it does NOT collide with
// tiles — it hovers within manually-clamped arena bounds, which keeps the flight smooth
// and stops it ever getting wedged in geometry. The Game owns hit detection; the boss
// just runs its own movement/AI and exposes `hit()` (−10% HP per player fireball).

import { TILE } from "./level.js";
import { TAU, clamp, approach } from "../core/math.js";

const BOSS_W = 60;
const BOSS_H = 76;

export const BOSS_MAX_HP = 100; // percent
const HIT_DAMAGE = 15;          // each player fireball removes 10% -> 10 hits to kill

const DRIFT_SPEED = 62;    // lazy tracking hover
const CHARGE_SPEED = 100;  // aggressive rush toward the player
const GRAVITY = 3500;      // pulls the boss down during a jump/slam
const JUMP_VEL = 760;      // upward impulse of a slam
const HOVER_EASE = 3.4;    // how quickly the boss eases to its hover height

const SHOOT_EVERY = 3;   // s between fireballs
const SHOT_SPEED = 500;    // px/s of an aimed boss fireball

const BODY = "#2a0d24";           // near-black plum body fill
const NEON = "#ff2e6e";           // hot crimson outline
const NEON2 = "#c678ff";          // violet secondary glow
const EYE = "#ffe03d";            // molten amber eye

export class Boss {
  // `bounds` = { minX, maxX, floorY, ceilY } in world px (the playable arena rectangle).
  constructor(spec, bounds) {
    this.w = BOSS_W;
    this.h = BOSS_H;
    this.minX = bounds.minX;
    this.maxX = bounds.maxX;
    this.floorY = bounds.floorY; // y of the ground surface the boss slams onto
    this.ceilY = bounds.ceilY;

    this.hoverY = this.floorY - this.h - TILE * 3;
    this.x = clamp(spec.x + TILE / 2 - this.w / 2, this.minX, this.maxX - this.w);
    this.y = this.hoverY;
    this.px = this.x; this.py = this.y;

    this.vx = 0;
    this.vy = 0;
    this.dir = -1;      // horizontal steering direction
    this.facing = -1;   // which way the head points
    this.airborne = false;

    this.hp = BOSS_MAX_HP;
    this.maxHp = BOSS_MAX_HP;

    this.time = Math.random() * 3;
    this.action = "drift";
    this.actionT = 1.2;
    this.speed = DRIFT_SPEED;
    this.shootT = 1.0;   // first shot delay
    this.hurtFlash = 0;  // brief white flash on taking a hit

    this.dying = false;
    this.deathT = 0;
    this.alive = true;
    this.type = "boss";
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  // Where fireballs leave the mouth (front of the head).
  get mouthX() { return this.cx + this.facing * this.w * 0.4; }
  get mouthY() { return this.y + this.h * 0.34; }

  // Take a player fireball. Returns true if it landed (false once already dying).
  hit() {
    if (this.dying) return false;
    this.hp = Math.max(0, this.hp - HIT_DAMAGE);
    this.hurtFlash = 0.16;
    if (this.hp <= 0) {
      this.dying = true;
      this.deathT = 1.2;
      this.vy = -260; // little death pop
    }
    return true;
  }

  // Choose the next behaviour and its duration. Called when the action timer expires.
  _pickAction(player) {
    this.dir = player.cx < this.cx ? -1 : 1;
    const roll = Math.random();
    if (!this.airborne && roll < 0.32) {
      // Slam: leap up, then gravity drops it toward the floor for a shockwave landing.
      this.airborne = true;
      this.vy = -JUMP_VEL;
      this.action = "jump";
      this.speed = CHARGE_SPEED;
      this.actionT = 1.5;
    } else if (roll < 0.62) {
      // Charge: rush toward the player's column.
      this.action = "charge";
      this.speed = CHARGE_SPEED;
      this.actionT = 0.8 + Math.random() * 0.5;
    } else {
      // Drift: amble sideways and pick a fresh hover altitude (vertical repositioning).
      // The low end dips close to the floor so a ground-level horizontal shot can land.
      this.action = "drift";
      this.speed = DRIFT_SPEED;
      this.actionT = 1.1 + Math.random() * 1.3;
      this.hoverY = clamp(
        this.floorY - this.h - TILE * (0.3 + Math.random() * 5),
        this.ceilY + TILE,
        this.floorY - this.h - TILE * 0.3,
      );
    }
  }

  // api = { shoot(boss), shock(x, y) } — the Game supplies spawning/fx callbacks.
  update(dt, player, api) {
    this.px = this.x; this.py = this.y;
    this.time += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    if (this.dying) {
      // Slump: rise briefly then fall through to the floor as the death timer runs out.
      this.deathT -= dt;
      this.vy += GRAVITY * dt;
      this.y = Math.min(this.floorY - this.h, this.y + this.vy * dt);
      this.vx = approach(this.vx, 0, 400 * dt);
      this.x += this.vx * dt;
      if (this.deathT <= 0) this.alive = false;
      return;
    }

    this.actionT -= dt;
    if (this.actionT <= 0) this._pickAction(player);

    // Always face the player except while committed to a jump arc.
    if (this.action !== "jump") this.facing = player.cx < this.cx ? -1 : 1;

    // --- Horizontal: steer toward the player, bounce off the arena walls ------
    this.dir = player.cx < this.cx ? -1 : 1;
    this.vx = approach(this.vx, this.dir * this.speed, 620 * dt);
    this.x += this.vx * dt;
    if (this.x < this.minX) { this.x = this.minX; this.vx = Math.abs(this.vx); }
    if (this.x + this.w > this.maxX) { this.x = this.maxX - this.w; this.vx = -Math.abs(this.vx); }

    // --- Vertical: jump arc (gravity) or eased hover with a gentle bob --------
    if (this.airborne) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y + this.h >= this.floorY) {
        this.y = this.floorY - this.h;
        this.airborne = false;
        this.vy = 0;
        if (api.shock) api.shock(this.cx, this.floorY);
      }
    } else {
      const target = this.hoverY + Math.sin(this.time * 1.6) * 10;
      this.y += (target - this.y) * Math.min(1, HOVER_EASE * dt);
    }

    // --- Fireballs: aimed at the player's centre ------------------------------
    this.shootT -= dt;
    if (this.shootT <= 0) {
      this.shootT = SHOOT_EVERY;
      if (api.shoot) api.shoot(this);
    }
  }

  renderPos(alpha) {
    return {
      x: this.px + (this.x - this.px) * alpha,
      y: this.py + (this.y - this.py) * alpha,
    };
  }

  draw(r, alpha, time) { drawBoss(r, this, alpha, time); }
}

// Procedural neon boss dino — a bigger, meaner silhouette than the player's T-Rex:
// heavy jaw with teeth, back horns/spikes, a thick tail, and a glowing eye. Mirrored to
// face the player. Origin is the feet; +x is "forward" (facing applied as a flip).
function drawBoss(r, b, alpha, time) {
  const ctx = r.ctx;
  const pos = b.renderPos(alpha);
  const feetX = pos.x + b.w / 2;
  const feetY = pos.y + b.h;
  const outline = b.hurtFlash > 0 ? "#ffffff" : NEON;
  const bob = Math.sin(time * 2.4) * 2 + (b.airborne ? -3 : 0);
  const dying = b.dying;

  ctx.save();
  ctx.translate(feetX, feetY);
  ctx.scale(b.facing, 1);
  if (dying) { // topple over as it dies
    const t = 1 - Math.max(0, b.deathT) / 1.2;
    ctx.rotate(t * 0.5);
    ctx.globalAlpha = Math.max(0, 1 - t);
  }
  ctx.translate(0, bob);
  // Everything is drawn in a ~1.9x scaled space so it dwarfs the 22x30 player.
  ctx.scale(1.9, 1.9);

  // --- Tail (behind) --------------------------------------------------------
  ctx.save();
  ctx.shadowColor = NEON2; ctx.shadowBlur = 14;
  ctx.strokeStyle = NEON2; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, -18);
  ctx.quadraticCurveTo(-26, -16 + Math.sin(time * 3) * 3, -34, -3);
  ctx.stroke();
  ctx.restore();

  // --- Legs -----------------------------------------------------------------
  drawBossLeg(ctx, -5, outline, time, 0);
  drawBossLeg(ctx, 6, outline, time, Math.PI);

  // --- Body -----------------------------------------------------------------
  ctx.save();
  ctx.shadowColor = outline; ctx.shadowBlur = 16;
  ctx.fillStyle = BODY; ctx.strokeStyle = outline; ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(-2, -20, 15, 17, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // --- Back spikes ----------------------------------------------------------
  ctx.save();
  ctx.shadowColor = NEON2; ctx.shadowBlur = 10;
  ctx.fillStyle = NEON2;
  for (const [x, y, s] of [[-12, -30, 5], [-6, -36, 7], [1, -38, 8], [8, -36, 6], [14, -30, 5]]) {
    ctx.beginPath();
    ctx.moveTo(x - 3, y + s);
    ctx.lineTo(x, y - s);
    ctx.lineTo(x + 3, y + s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // --- Head + heavy jaw -----------------------------------------------------
  ctx.save();
  ctx.shadowColor = outline; ctx.shadowBlur = 14;
  ctx.fillStyle = BODY; ctx.strokeStyle = outline; ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(6, -40);
  ctx.quadraticCurveTo(30, -44, 34, -32); // top skull -> snout
  ctx.lineTo(33, -24);                    // snout tip
  ctx.lineTo(14, -22);                    // lower jaw
  ctx.quadraticCurveTo(8, -26, 6, -33);   // jaw hinge
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // teeth
  ctx.save();
  ctx.fillStyle = "#ffe8f4";
  ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 4;
  for (let i = 0; i < 4; i++) {
    const tx = 18 + i * 4;
    ctx.beginPath();
    ctx.moveTo(tx, -25);
    ctx.lineTo(tx + 1.6, -25);
    ctx.lineTo(tx + 0.8, -21.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // brow horn
  ctx.save();
  ctx.shadowColor = NEON2; ctx.shadowBlur = 8;
  ctx.strokeStyle = NEON2; ctx.lineWidth = 2.4; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(12, -40);
  ctx.lineTo(9, -49);
  ctx.stroke();
  ctx.restore();

  // eye (molten, pulsing)
  const eye = 2.4 + Math.sin(time * 6) * 0.5;
  ctx.save();
  ctx.shadowColor = EYE; ctx.shadowBlur = 12;
  ctx.fillStyle = EYE;
  ctx.beginPath();
  ctx.arc(16, -35, eye, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawBossLeg(ctx, hipX, color, time, offset) {
  const hipY = -14;
  const swing = Math.sin(time * 2 + offset) * 2;
  const footX = hipX + swing;
  const footY = -1;
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo((hipX + footX) / 2 + 3, (hipY + footY) / 2);
  ctx.lineTo(footX, footY);
  ctx.lineTo(footX + 4, footY);
  ctx.stroke();
  ctx.restore();
}

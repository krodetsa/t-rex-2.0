// The T-Rex controller. All the "game feel" lives here: acceleration/friction,
// variable-height jumping, coyote time, jump buffering, asymmetric gravity with an
// apex hang, and squash/stretch. Units are world pixels and seconds.

import { moveAndCollide } from "./physics.js";
import { clamp, approach } from "../core/math.js";

// --- Tuning ------------------------------------------------------------------
const WIDTH = 22;
const HEIGHT = 30;

const MAX_RUN = 224; // px/s
const GROUND_ACCEL = 2600;
const GROUND_FRICTION = 2800;
const AIR_ACCEL = 1700;
const AIR_FRICTION = 500;

const JUMP_VEL = 660; // initial upward speed
const GRAVITY_RISE = 2050;
const GRAVITY_FALL = 3250; // heavier fall = snappier
const APEX_THRESHOLD = 70; // |vy| under this near the top = floaty hang
const APEX_GRAVITY_MULT = 0.55;
const TERMINAL_VY = 980;
const JUMP_CUT = 0.45; // releasing jump early keeps only this fraction of upward vel

const COYOTE_TIME = 0.10; // s after leaving ground you can still jump
const JUMP_BUFFER = 0.12; // s before landing a jump press still counts

export class Player {
  constructor(spawn, fx) {
    this.fx = fx || {};
    this.body = { x: spawn.x, y: spawn.y, w: WIDTH, h: HEIGHT, vx: 0, vy: 0 };
    this.spawn = { ...spawn };

    this.grounded = false;
    this.facing = 1; // 1 right, -1 left
    this.coyote = 0;
    this.buffer = 0;
    this.jumpHeld = false;
    this.dead = false;

    // Render/animation state
    this.scaleX = 1;
    this.scaleY = 1;
    this.runPhase = 0;
    this.stepTimer = 0;

    // Previous-position snapshot for render interpolation
    this.px = this.body.x;
    this.py = this.body.y;
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get w() { return this.body.w; }
  get h() { return this.body.h; }
  get cx() { return this.body.x + this.body.w / 2; }
  get cy() { return this.body.y + this.body.h / 2; }

  reset() {
    this.body.x = this.spawn.x;
    this.body.y = this.spawn.y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.px = this.body.x;
    this.py = this.body.y;
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.dead = false;
    this.scaleX = this.scaleY = 1;
  }

  update(dt, input, level) {
    if (this.dead) return;
    this.px = this.body.x;
    this.py = this.body.y;
    const b = this.body;

    // --- Horizontal input ----------------------------------------------------
    const dir = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
    const onGround = this.grounded;
    if (dir !== 0) {
      const accel = onGround ? GROUND_ACCEL : AIR_ACCEL;
      b.vx = approach(b.vx, dir * MAX_RUN, accel * dt);
      this.facing = dir;
    } else {
      const friction = onGround ? GROUND_FRICTION : AIR_FRICTION;
      b.vx = approach(b.vx, 0, friction * dt);
    }

    // --- Jump: buffering + coyote -------------------------------------------
    if (input.justPressed("jump")) this.buffer = JUMP_BUFFER;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = onGround ? COYOTE_TIME : Math.max(0, this.coyote - dt);

    const jumpDown = input.isDown("jump");
    if (this.buffer > 0 && this.coyote > 0) {
      b.vy = -JUMP_VEL;
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      // stretch tall on takeoff
      this.scaleX = 0.78;
      this.scaleY = 1.28;
      if (this.fx.jump) this.fx.jump(this.cx, b.y + b.h);
    }
    // Variable height: released while rising cuts the jump short.
    if (!jumpDown && this.jumpHeld && b.vy < 0) {
      b.vy *= JUMP_CUT;
    }
    this.jumpHeld = jumpDown;

    // --- Gravity (asymmetric + apex hang) -----------------------------------
    let g = b.vy < 0 ? GRAVITY_RISE : GRAVITY_FALL;
    if (Math.abs(b.vy) < APEX_THRESHOLD && !onGround) g *= APEX_GRAVITY_MULT;
    b.vy = clamp(b.vy + g * dt, -JUMP_VEL, TERMINAL_VY);

    // --- Integrate + collide -------------------------------------------------
    const wasGrounded = this.grounded;
    const flags = moveAndCollide(b, level, dt);
    this.grounded = flags.grounded;
    if (flags.hitCeiling && b.vy < 0) b.vy = 0;

    // Landing: squash + dust
    if (this.grounded && !wasGrounded) {
      const impact = clamp(this._fallSpeed / TERMINAL_VY, 0, 1);
      this.scaleX = 1 + 0.32 * impact;
      this.scaleY = 1 - 0.30 * impact;
      if (this.fx.land) this.fx.land(this.cx, b.y + b.h, impact);
    }
    this._fallSpeed = b.vy > 0 ? b.vy : 0;

    // --- Animation -----------------------------------------------------------
    // Ease squash/stretch back toward 1.
    this.scaleX = approach(this.scaleX, 1, 6 * dt);
    this.scaleY = approach(this.scaleY, 1, 6 * dt);

    // Run cycle speed scales with horizontal speed; emit footstep dust.
    if (this.grounded && Math.abs(b.vx) > 12) {
      this.runPhase += Math.abs(b.vx) * dt * 0.045;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = clamp(90 / (Math.abs(b.vx) + 60), 0.06, 0.3);
        if (this.fx.step) this.fx.step(this.cx, b.y + b.h, this.facing);
      }
    } else {
      this.runPhase += dt * 2; // idle breathing
    }
  }

  // Render position, interpolated between previous and current sim step.
  renderPos(alpha) {
    return {
      x: this.px + (this.body.x - this.px) * alpha,
      y: this.py + (this.body.y - this.py) * alpha,
    };
  }
}

export { WIDTH as PLAYER_W, HEIGHT as PLAYER_H };

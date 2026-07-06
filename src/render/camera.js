// Smooth follow camera. Tracks the player's center with a small deadzone, adds
// velocity-based lookahead (so you see more of where you're going), and eases with a
// critically-damped spring. Position is clamped to the level bounds.

import { clamp, smoothDamp } from "../core/math.js";

const LOOKAHEAD = 90; // px ahead in the direction of travel
const DEADZONE_X = 24; // px the target can drift before the camera reacts
const DEADZONE_Y = 40;
const SMOOTH_X = 0.16; // spring smooth-time (s); lower = snappier
const SMOOTH_Y = 0.22;

export class Camera {
  constructor() {
    this.cx = 0; // center in world px
    this.cy = 0;
    this.vx = 0; // spring velocities
    this.vy = 0;
    this.look = 0; // eased lookahead offset
    this.vw = 640;
    this.vh = 360;
  }

  setViewport(w, h) {
    this.vw = w;
    this.vh = h;
  }

  snapTo(x, y) {
    this.cx = x;
    this.cy = y;
    this.vx = this.vy = 0;
  }

  follow(target, facingVel, dt, level) {
    // Ease lookahead toward the direction of horizontal motion.
    const wantLook = clamp(facingVel / 220, -1, 1) * LOOKAHEAD;
    this.look += (wantLook - this.look) * clamp(dt * 4, 0, 1);

    const tx = target.x + this.look;
    const ty = target.y;

    // Deadzone: spring toward the target, but ignore drift within a small window so
    // tiny movements don't jitter the camera.
    const dx = tx - this.cx;
    const dy = ty - this.cy;
    const targetX = this.cx + (dx - clamp(dx, -DEADZONE_X, DEADZONE_X));
    const targetY = this.cy + (dy - clamp(dy, -DEADZONE_Y, DEADZONE_Y));

    [this.cx, this.vx] = smoothDamp(this.cx, targetX, this.vx, SMOOTH_X, dt);
    [this.cy, this.vy] = smoothDamp(this.cy, targetY, this.vy, SMOOTH_Y, dt);

    this._clamp(level);
  }

  _clamp(level) {
    const halfW = this.vw / 2;
    const halfH = this.vh / 2;
    if (level.width <= this.vw) {
      this.cx = level.width / 2;
    } else {
      this.cx = clamp(this.cx, halfW, level.width - halfW);
    }
    if (level.height <= this.vh) {
      this.cy = level.height / 2;
    } else {
      this.cy = clamp(this.cy, halfH, level.height - halfH);
    }
  }

  // Top-left of the viewport in world space.
  get left() { return this.cx - this.vw / 2; }
  get top() { return this.cy - this.vh / 2; }
}

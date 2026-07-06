// AABB-vs-tilemap collision. Resolves one axis at a time (X then Y), sub-stepping so a
// fast body never skips over a tile (no tunneling), and supports one-way platforms.
//
// A "body" is a plain object: { x, y, w, h, vx, vy } in world pixels. moveAndCollide
// mutates x/y (and zeroes vx/vy on impact) and returns a flags object.

import { TILE, T } from "./level.js";

const EPS = 1e-4;

function rowsOverlapped(body) {
  const r0 = Math.floor(body.y / TILE);
  const r1 = Math.floor((body.y + body.h - EPS) / TILE);
  return [r0, r1];
}
function colsOverlapped(body) {
  const c0 = Math.floor(body.x / TILE);
  const c1 = Math.floor((body.x + body.w - EPS) / TILE);
  return [c0, c1];
}

// Resolve a horizontal move. dx already includes dt. Only solids block horizontally.
function moveX(body, level, dx, flags) {
  body.x += dx;
  const [r0, r1] = rowsOverlapped(body);
  if (dx > 0) {
    const col = Math.floor((body.x + body.w - EPS) / TILE);
    for (let r = r0; r <= r1; r++) {
      if (level.tileAt(col, r) === T.SOLID) {
        body.x = col * TILE - body.w;
        body.vx = 0;
        flags.hitRight = true;
        return;
      }
    }
  } else if (dx < 0) {
    const col = Math.floor(body.x / TILE);
    for (let r = r0; r <= r1; r++) {
      if (level.tileAt(col, r) === T.SOLID) {
        body.x = (col + 1) * TILE;
        body.vx = 0;
        flags.hitLeft = true;
        return;
      }
    }
  }
}

// Resolve a vertical move. dy already includes dt. Solids block both ways; one-way
// platforms block only when falling onto them from above.
function moveY(body, level, dy, flags) {
  const prevBottom = body.y + body.h;
  body.y += dy;
  const [c0, c1] = colsOverlapped(body);
  if (dy > 0) {
    const row = Math.floor((body.y + body.h - EPS) / TILE);
    const top = row * TILE;
    for (let c = c0; c <= c1; c++) {
      const tile = level.tileAt(c, row);
      const isFloor =
        tile === T.SOLID ||
        (tile === T.ONEWAY && prevBottom <= top + 1); // was above the platform
      if (isFloor) {
        body.y = top - body.h;
        body.vy = 0;
        flags.grounded = true;
        return;
      }
    }
  } else if (dy < 0) {
    const row = Math.floor(body.y / TILE);
    for (let c = c0; c <= c1; c++) {
      if (level.tileAt(c, row) === T.SOLID) {
        body.y = (row + 1) * TILE;
        body.vy = 0;
        flags.hitCeiling = true;
        return;
      }
    }
  }
}

// Move the body by its velocity over dt, resolving collisions. Sub-steps to a max of
// half a tile per iteration to stay tunnel-proof at any speed.
export function moveAndCollide(body, level, dt) {
  const flags = { grounded: false, hitCeiling: false, hitLeft: false, hitRight: false };
  const dx = body.vx * dt;
  const dy = body.vy * dt;
  const maxStep = TILE * 0.5;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.ceil(dist / maxStep));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) moveX(body, level, sx, flags);
    if (sy !== 0) moveY(body, level, sy, flags);
  }
  return flags;
}

// True if the body's AABB overlaps any tile of the given id (e.g. lava).
export function overlapsTile(body, level, tileId) {
  const [c0, c1] = colsOverlapped(body);
  const [r0, r1] = rowsOverlapped(body);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (level.tileAt(c, r) === tileId) return true;
  return false;
}

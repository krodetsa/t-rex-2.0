// Per-level orchestration: owns the player, entities, particles and camera; runs the
// update order and win/lose/respawn logic; draws the world (tiles + entities + player +
// particles). Screens/HUD/level-sequencing live in main.js and talk to this via hooks.

import { Level, TILE, T } from "./level.js";
import { Player } from "./player.js";
import { Bone, Fireball, Goal } from "./entities.js";
import { overlapsTile } from "./physics.js";
import { drawTrex } from "../render/trex.js";
import { aabb, clamp } from "../core/math.js";

const RESPAWN_DELAY = 1.0; // s of death animation before respawn
const WIN_DELAY = 0.7;

export class Game {
  constructor(plan, deps, hooks) {
    this.level = new Level(plan);
    this.audio = deps.audio;
    this.particles = deps.particles;
    this.camera = deps.camera;
    this.background = deps.background;
    this.hooks = hooks; // { onComplete, onLives, onBones }

    const fx = {
      jump: (x, y) => { this.particles.jump(x, y); this.audio.jump(); },
      land: (x, y, power) => { this.particles.land(x, y, power); if (power > 0.06) this.audio.land(); },
      step: (x, y, dir) => this.particles.footstep(x, y, dir),
    };
    this.player = new Player(this.level.spawn, fx);

    this._boneSpecs = [];
    this.fireballs = [];
    this.goal = null;
    for (const s of this.level.spawns) {
      if (s.type === "bone") this._boneSpecs.push(s);
      else if (s.type === "fireballH") this.fireballs.push(new Fireball(s, "h"));
      else if (s.type === "fireballV") this.fireballs.push(new Fireball(s, "v"));
      else if (s.type === "goal") this.goal = new Goal(s);
    }
    this.bonesTotal = this._boneSpecs.length;
    this._spawnBones();

    // Cache the lava tile columns per row for cheap ember spawning.
    this._lavaSurface = this._findLavaSurface();

    this.state = "play"; // play | dying | won
    this.timer = 0;
    this.time = 0;
    this._emberT = 0;

    this.camera.snapTo(this.player.cx, this.player.cy);
    this.camera._clamp(this.level);
    this._reportHud();
  }

  // (Re)create all bones from their spawn specs and reset the counter/goal lock.
  // Called on level start and on every respawn so a death restores collected bones.
  _spawnBones() {
    this.bones = this._boneSpecs.map((s) => new Bone(s));
    this.bonesLeft = this.bonesTotal;
    if (this.goal) this.goal.active = false;
    this._reportHud();
  }

  _findLavaSurface() {
    const surf = [];
    for (let c = 0; c < this.level.cols; c++) {
      for (let r = 0; r < this.level.rows; r++) {
        if (this.level.grid[r][c] === T.LAVA && (r === 0 || this.level.grid[r - 1][c] !== T.LAVA)) {
          surf.push({ x: c * TILE + TILE / 2, y: r * TILE });
          break;
        }
      }
    }
    return surf;
  }

  _reportHud() {
    if (this.hooks.onBones) this.hooks.onBones(this.bonesTotal - this.bonesLeft, this.bonesTotal);
  }

  update(dt, input) {
    this.time += dt;

    // Ambient lava embers regardless of state.
    this._emberT -= dt;
    if (this._emberT <= 0 && this._lavaSurface.length) {
      this._emberT = 0.05;
      const s = this._lavaSurface[(Math.random() * this._lavaSurface.length) | 0];
      this.particles.ember(s.x, s.y);
    }

    for (const b of this.bones) b.update(dt, this.level, this.time);
    for (const f of this.fireballs) f.update(dt, this.level);
    if (this.goal) this.goal.update(dt);
    this.particles.update(dt);

    if (this.state === "won") {
      this.timer -= dt;
      if (this.timer <= 0 && this.hooks.onComplete) { this.hooks.onComplete(); this.state = "done"; }
      return;
    }
    if (this.state === "dying") {
      this.timer -= dt;
      if (this.timer <= 0) this._respawn();
      return;
    }
    if (this.state !== "play") return;

    this.player.update(dt, input, this.level);

    // Camera follows the player center with lookahead from its horizontal velocity.
    this.camera.follow({ x: this.player.cx, y: this.player.cy }, this.player.body.vx, dt, this.level);

    // --- Collisions ---------------------------------------------------------
    const pb = this.player.body;
    for (const b of this.bones) {
      if (!b.collected && aabb(pb.x, pb.y, pb.w, pb.h, b.x, b.y, b.w, b.h)) {
        b.collected = true;
        this.bonesLeft--;
        this.particles.boneBurst(b.cx, b.cy);
        this.audio.bone();
        this._reportHud();
      }
    }
    this.bones = this.bones.filter((b) => !b.collected);
    if (this.goal) this.goal.active = this.bonesLeft <= 0;

    for (const f of this.fireballs) {
      if (aabb(pb.x, pb.y, pb.w, pb.h, f.body.x, f.body.y, f.w, f.h)) { this._die(); return; }
    }
    if (overlapsTile(pb, this.level, T.LAVA)) { this._die(); return; }
    if (pb.y > this.level.height + 80) { this._die(); return; } // fell off the map

    if (this.goal && this.goal.active &&
        aabb(pb.x, pb.y, pb.w, pb.h, this.goal.x, this.goal.y, this.goal.w, this.goal.h)) {
      this._win();
    }
  }

  _die() {
    if (this.state !== "play") return;
    this.state = "dying";
    this.timer = RESPAWN_DELAY;
    this.player.dead = true;
    this.particles.death(this.player.cx, this.player.cy);
    this.audio.death();
    // lives handled by the host; wrap like the original game (0 -> back to 3).
    if (this.hooks.onLives) this.hooks.onLives(-1);
  }

  _respawn() {
    this.player.reset();
    this._spawnBones(); // collected bones come back on death
    this.camera.snapTo(this.player.cx, this.player.cy);
    this.camera._clamp(this.level);
    this.state = "play";
  }

  _win() {
    this.state = "won";
    this.timer = WIN_DELAY;
    this.player.dead = true;
    this.particles.boneBurst(this.goal.cx, this.goal.cy);
    this.audio.win();
  }

  // ---------------------------------------------------------------- rendering
  draw(r, alpha) {
    r.clear();
    this.background.draw(r, this.camera, this.time);

    r.beginWorld(this.camera);
    this._drawTiles(r);
    for (const b of this.bones) b.draw(r, alpha, this.time);
    if (this.goal) this.goal.draw(r, alpha, this.time);
    for (const f of this.fireballs) f.draw(r, alpha, this.time);
    if (!this.player.dead) drawTrex(r, this.player, alpha, this.time);
    this.particles.draw(r);
  }

  // Tiles are drawn in batched passes so the expensive glow (shadowBlur) neon edges are
  // stroked once for the whole screen instead of once per tile. Everything with the same
  // style is accumulated into a Path2D, then filled/stroked in a single call.
  _drawTiles(r) {
    const ctx = r.ctx;
    const lvl = this.level;
    // Only iterate tiles within the camera view (+1 margin).
    const c0 = clamp(Math.floor(this.camera.left / TILE) - 1, 0, lvl.cols - 1);
    const c1 = clamp(Math.ceil((this.camera.left + this.camera.vw) / TILE) + 1, 0, lvl.cols - 1);
    const r0 = clamp(Math.floor(this.camera.top / TILE) - 1, 0, lvl.rows - 1);
    const r1 = clamp(Math.ceil((this.camera.top + this.camera.vh) / TILE) + 1, 0, lvl.rows - 1);

    const solidFill = new Path2D();   // dark block bodies
    const gridPath = new Path2D();    // faint inner grid
    const edgePath = new Path2D();    // bright neon edges (glow)
    const onewayBar = new Path2D();   // one-way platform tops (glow)
    const onewayDash = new Path2D();  // one-way support dashes
    const lavaSurface = new Path2D(); // glowing wavy lava tops
    let hasSolid = false, hasOneway = false, hasLavaSurf = false;
    const lavaGrads = new Map();      // row-y -> cached vertical gradient

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const t = lvl.grid[row][col];
        if (t === T.EMPTY) continue;
        const x = col * TILE, y = row * TILE;
        if (t === T.SOLID) {
          hasSolid = true;
          solidFill.rect(x, y, TILE, TILE);
          gridPath.rect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          // neon edge only on exposed faces
          if (lvl.tileAt(col, row - 1) !== T.SOLID) { edgePath.moveTo(x, y); edgePath.lineTo(x + TILE, y); }
          if (lvl.tileAt(col, row + 1) !== T.SOLID) { edgePath.moveTo(x, y + TILE); edgePath.lineTo(x + TILE, y + TILE); }
          if (lvl.tileAt(col - 1, row) !== T.SOLID) { edgePath.moveTo(x, y); edgePath.lineTo(x, y + TILE); }
          if (lvl.tileAt(col + 1, row) !== T.SOLID) { edgePath.moveTo(x + TILE, y); edgePath.lineTo(x + TILE, y + TILE); }
        } else if (t === T.ONEWAY) {
          hasOneway = true;
          onewayBar.moveTo(x + 3, y + 4);
          onewayBar.lineTo(x + TILE - 3, y + 4);
          for (let i = 6; i < TILE; i += 8) {
            onewayDash.moveTo(x + i, y + 6);
            onewayDash.lineTo(x + i - 3, y + 12);
          }
        } else if (t === T.LAVA) {
          // lava body: per-row vertical gradient (cached), no shadow -> cheap.
          let grad = lavaGrads.get(y);
          if (!grad) {
            grad = ctx.createLinearGradient(0, y, 0, y + TILE);
            grad.addColorStop(0, "#ff9a3d");
            grad.addColorStop(1, "#8a1030");
            lavaGrads.set(y, grad);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, TILE, TILE);
          if (this.level.tileAt(col, row - 1) !== T.LAVA) {
            hasLavaSurf = true;
            for (let i = 0; i <= TILE; i += 4) {
              const wy = y + 2 + Math.sin((x + i) * 0.15 + this.time * 4) * 2;
              if (i === 0) lavaSurface.moveTo(x + i, wy);
              else lavaSurface.lineTo(x + i, wy);
            }
          }
        }
      }
    }

    // --- Solid blocks -------------------------------------------------------
    if (hasSolid) {
      ctx.fillStyle = "rgba(16,22,52,0.94)";
      ctx.fill(solidFill);
      ctx.strokeStyle = "rgba(55,242,255,0.10)";
      ctx.lineWidth = 1;
      ctx.stroke(gridPath);
    }
    // --- Glow passes (one shadowed stroke each) ------------------------------
    if (hasSolid) {
      ctx.save();
      ctx.shadowColor = "#37f2ff";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#37f2ff";
      ctx.lineWidth = 2;
      ctx.stroke(edgePath);
      ctx.restore();
    }
    if (hasOneway) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.shadowColor = "#37f2ff";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#8fe9ff";
      ctx.lineWidth = 3;
      ctx.stroke(onewayBar);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.stroke(onewayDash);
      ctx.restore();
    }
    if (hasLavaSurf) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "#ff6a3d";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "#ffd08a";
      ctx.lineWidth = 2.5;
      ctx.stroke(lavaSurface);
      ctx.restore();
    }
  }
}
